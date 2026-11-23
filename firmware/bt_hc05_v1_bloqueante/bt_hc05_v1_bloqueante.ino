/*
 * Entrega 2 - VERSION 1 (respuestas bloqueantes), conservada para comparar.
 * Entrega 2 - Uso practico de Arduino (Internet de las cosas)
 * Politecnico Grancolombiano - Luis Eduardo Ortiz Perea
 *
 * Recepcion de ordenes por Bluetooth (modulo HC-05) en un Arduino UNO.
 *
 * Conexiones (segun la Fig. 2 de la guia, con dos agregados):
 *   HC-05 TXD   -> D0 (RX del UNO)
 *   HC-05 RXD   <- D1 (TX del UNO) a traves de un divisor 1 k / 2 k (5 V -> 3,3 V)
 *   HC-05 VCC   -> 5 V,  GND -> GND
 *   HC-05 STATE -> D5   (agregado: alto = enlace Bluetooth establecido)
 *   LED verde   -> D2 con resistencia de 220 ohm a GND
 *   LED rojo    -> D3 con resistencia de 220 ohm a GND
 *   Pulsador    -> D4 a GND (agregado: usa la resistencia pull-up interna)
 *
 * El HC-05 es un puente transparente: lo que el telefono envia por el perfil
 * de puerto serie (SPP) de Bluetooth llega como bytes al UART del UNO a
 * 9600 baudios, 8N1 (configuracion de fabrica del modulo).
 *
 * Protocolo (una orden por linea, terminada en '\n' o '\r', sin distinguir
 * mayusculas):
 *   V1 / V0      enciende / apaga el LED verde        -> "OK V1"
 *   R1 / R0      enciende / apaga el LED rojo         -> "OK R0"
 *   S            estado completo                     -> "ST V=1 R=0 ..."
 *   P            prueba de conectividad              -> "PONG <n>"
 *   E <texto>    eco del texto (pruebas de integridad) -> "E <texto>"
 *   ?            ayuda
 *   otra cosa                                         -> "ERR <orden>"
 * Eventos que envia la placa sin que se los pidan:
 *   EV BTN 1/0   el pulsador cambio de estado (ya filtrado el rebote);
 *                al pulsar, ademas, se conmuta el LED rojo.
 *   EV BT 1/0    el enlace Bluetooth se establecio / se perdio. Al perderse
 *                se apagan los dos LED (modo seguro).
 *   #T,...       telemetria CSV cada segundo:
 *                #T,t_ms,cpu_x10,loops,bytes_rx,ordenes_ok,ordenes_err,verde,rojo,enlace
 *
 * Medicion de carga: "loops" cuenta las iteraciones de loop() por segundo;
 * "cpu_x10" es el porcentaje de tiempo en que la CPU estuvo ACTIVA (x10).
 * Son cosas distintas: con USAR_SLEEP=1 la CPU duerme (modo idle) cuando no
 * hay nada que hacer y la despierta cualquier interrupcion (byte recibido,
 * tic de millis() cada 1,024 ms). El tiempo dormido se mide con el Timer1
 * (prescaler 8 -> 0,5 us por cuenta). Con USAR_SLEEP=0 el lazo gira sin
 * parar y la CPU esta ocupada el 100 % del tiempo, haga lo que haga.
 */
#include <avr/sleep.h>

#ifndef BT_BAUD
#define BT_BAUD 9600
#endif
#ifndef USAR_SLEEP
#define USAR_SLEEP 1
#endif

const uint8_t PIN_LED_VERDE = 2;
const uint8_t PIN_LED_ROJO  = 3;
const uint8_t PIN_BOTON     = 4;
const uint8_t PIN_ESTADO_BT = 5;

const unsigned long ANTIRREBOTE_MS     = 30;    // tiempo estable exigido
const unsigned long PERIODO_TELEMETRIA = 1000;  // ms
const uint8_t       MAX_LINEA          = 48;    // caracteres por orden

// --- Recepcion de ordenes -------------------------------------------------
char    linea[MAX_LINEA + 1];
uint8_t nLinea = 0;
bool    lineaLarga = false;

// --- Estado ---------------------------------------------------------------
bool ledVerde = false, ledRojo = false;
uint16_t pongs = 0;
uint32_t bytesRx = 0, ordenesOk = 0, ordenesErr = 0;

// Entradas con deteccion de cambios
struct EntradaFiltrada {
  uint8_t pin;
  bool crudo, estable;
  unsigned long tCambio;
};
EntradaFiltrada boton  = {PIN_BOTON, true, true, 0};      // pull-up: reposo = alto
EntradaFiltrada enlace = {PIN_ESTADO_BT, false, false, 0};

// --- Medicion de carga ----------------------------------------------------
volatile uint32_t ticksDormido = 0;  // cuentas de Timer1 (0,5 us) en sleep
uint32_t loops = 0, loopsPorSeg = 0;
uint16_t cpuX10 = 0;
unsigned long tVentana = 0;

void ponerLeds() {
  digitalWrite(PIN_LED_VERDE, ledVerde);
  digitalWrite(PIN_LED_ROJO, ledRojo);
}

// Devuelve true solo cuando la entrada cambia de estado estable.
bool actualizar(EntradaFiltrada &e, unsigned long ahora) {
  bool v = digitalRead(e.pin);
  if (v != e.crudo) {            // hubo un flanco: reinicia la espera
    e.crudo = v;
    e.tCambio = ahora;
  } else if (v != e.estable && ahora - e.tCambio >= ANTIRREBOTE_MS) {
    e.estable = v;               // estable durante ANTIRREBOTE_MS
    return true;
  }
  return false;
}

void responderEstado() {
  Serial.print(F("ST V="));   Serial.print(ledVerde);
  Serial.print(F(" R="));     Serial.print(ledRojo);
  Serial.print(F(" BTN="));   Serial.print(!boton.estable);
  Serial.print(F(" BT="));    Serial.print(enlace.estable);
  Serial.print(F(" CPU="));   Serial.print(cpuX10 / 10); Serial.print('.'); Serial.print(cpuX10 % 10);
  Serial.print(F(" LOOPS=")); Serial.print(loopsPorSeg);
  Serial.print(F(" OK="));    Serial.print(ordenesOk);
  Serial.print(F(" ERR="));   Serial.println(ordenesErr);
}

void ejecutar(char *cmd) {
  for (char *p = cmd; *p && *p != ' '; p++) *p = toupper(*p);
  bool ok = true;
  if      (!strcmp(cmd, "V1")) ledVerde = true;
  else if (!strcmp(cmd, "V0")) ledVerde = false;
  else if (!strcmp(cmd, "R1")) ledRojo = true;
  else if (!strcmp(cmd, "R0")) ledRojo = false;
  else if (!strcmp(cmd, "S"))  { responderEstado(); ordenesOk++; return; }
  else if (!strcmp(cmd, "P"))  { Serial.print(F("PONG ")); Serial.println(++pongs); ordenesOk++; return; }
  else if (cmd[0] == 'E' && cmd[1] == ' ') { Serial.println(cmd); ordenesOk++; return; }
  else if (!strcmp(cmd, "?"))  { Serial.println(F("V1 V0 R1 R0 S P E<txt>")); ordenesOk++; return; }
  else ok = false;

  if (ok) {
    ponerLeds();                 // la orden se aplica en esta misma iteracion
    ordenesOk++;
    Serial.print(F("OK "));
  } else {
    ordenesErr++;
    Serial.print(F("ERR "));
  }
  Serial.println(cmd);
}

void recibir() {
  while (Serial.available()) {
    char c = Serial.read();
    bytesRx++;
    if (c == '\n' || c == '\r') {
      if (lineaLarga) { ordenesErr++; Serial.println(F("ERR LARGO")); }
      else if (nLinea > 0) { linea[nLinea] = '\0'; ejecutar(linea); }
      nLinea = 0;
      lineaLarga = false;
    } else if (nLinea < MAX_LINEA) {
      linea[nLinea++] = c;
    } else {
      lineaLarga = true;         // se descarta hasta el fin de linea
    }
  }
}

void dormir() {
#if USAR_SLEEP
  // Se revisa el buffer con las interrupciones desactivadas para no dormirse
  // justo despues de que llegue un byte (sei + sleep es atomico en AVR).
  cli();
  if (!Serial.available()) {
    uint16_t t0 = TCNT1;
    sleep_enable();
    sei();
    sleep_cpu();                 // despierta con cualquier interrupcion
    sleep_disable();
    ticksDormido += (uint16_t)(TCNT1 - t0);
  }
  sei();
#endif
}

void setup() {
  pinMode(PIN_LED_VERDE, OUTPUT);
  pinMode(PIN_LED_ROJO, OUTPUT);
  pinMode(PIN_BOTON, INPUT_PULLUP);
  pinMode(PIN_ESTADO_BT, INPUT);
  ponerLeds();

  // Timer1 libre a 2 MHz para medir el tiempo dormido
  TCCR1A = 0;
  TCCR1B = _BV(CS11);
  set_sleep_mode(SLEEP_MODE_IDLE);

  Serial.begin(BT_BAUD);
  Serial.println(F("UNO-BT listo. Ordenes: V1 V0 R1 R0 S P E<txt>"));
  tVentana = millis();
}

void loop() {
  unsigned long ahora = millis();
  loops++;

  recibir();

  if (actualizar(boton, ahora)) {
    bool pulsado = !boton.estable;          // activo en bajo
    if (pulsado) { ledRojo = !ledRojo; ponerLeds(); }
    Serial.print(F("EV BTN ")); Serial.println(pulsado);
  }

  if (actualizar(enlace, ahora)) {
    if (!enlace.estable) { ledVerde = ledRojo = false; ponerLeds(); }   // modo seguro
    Serial.print(F("EV BT ")); Serial.println(enlace.estable);
  }

  if (ahora - tVentana >= PERIODO_TELEMETRIA) {
    uint32_t ventanaUs = (ahora - tVentana) * 1000UL;
    cli(); uint32_t dormidoUs = ticksDormido / 2; ticksDormido = 0; sei();
    cpuX10 = (dormidoUs >= ventanaUs) ? 0 : (uint16_t)(1000UL - dormidoUs * 1000ULL / ventanaUs);
    loopsPorSeg = loops; loops = 0;
    tVentana = ahora;
    Serial.print(F("#T,")); Serial.print(ahora);   Serial.print(',');
    Serial.print(cpuX10);   Serial.print(',');     Serial.print(loopsPorSeg); Serial.print(',');
    Serial.print(bytesRx);  Serial.print(',');     Serial.print(ordenesOk);   Serial.print(',');
    Serial.print(ordenesErr); Serial.print(',');   Serial.print(ledVerde);    Serial.print(',');
    Serial.print(ledRojo);  Serial.print(',');     Serial.println(enlace.estable);
  }

  dormir();
}
