// Chip personalizado de Wokwi que emula un modulo Bluetooth HC-05 en modo datos.
// Entrega 2 - Uso practico de Arduino - Luis Eduardo Ortiz Perea
//
// Wokwi no simula enlaces de radio, asi que el modulo se modela como un puente
// UART transparente entre dos lados:
//   - Lado del modulo (TXD, RXD): se conecta al UART del Arduino (D0/D1).
//   - Lado "aire" (SPP_RX, SPP_TX): representa el perfil de puerto serie (SPP)
//     del telefono; se conecta al monitor serie de Wokwi, que hace de app de
//     terminal Bluetooth.
// STATE queda en alto cuando hay enlace (como el pin STATE del modulo real).
// El enlace se establece t_enlace_ms despues del arranque (emparejamiento) y se
// puede cortar y restablecer con el control "cortar" del chip (1 = cortado). Sin enlace, los
// bytes se descartan en ambos sentidos, como en el modulo real.
// Con el atributo demo = 1, el propio chip envia un guion de ordenes de prueba.
#include "wokwi-api.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define QN 256

typedef struct {
  uint8_t buf[QN];
  uint16_t head, tail;
  bool ocupado;
  uart_dev_t uart;
} cola_t;

typedef struct {
  pin_t state;
  cola_t al_arduino, al_telefono;
  uint32_t control_cortar;
  bool emparejado, enlace;
  timer_t t_enlace, t_demo;
  int paso_demo;
  uint32_t perdidos;
} chip_t;

static void cola_bombear(cola_t *c) {
  if (c->ocupado || c->head == c->tail) return;
  uint8_t b = c->buf[c->head];
  if (uart_write(c->uart, &b, 1)) {
    c->head = (c->head + 1) % QN;
    c->ocupado = true;
  }
}

static void cola_poner(chip_t *chip, cola_t *c, uint8_t b) {
  if (!chip->enlace) { chip->perdidos++; return; }   // sin enlace: se descarta
  uint16_t sig = (c->tail + 1) % QN;
  if (sig == c->head) { chip->perdidos++; return; }   // buffer del modulo lleno
  c->buf[c->tail] = b;
  c->tail = sig;
  cola_bombear(c);
}

static void hecho_arduino(void *ud) {
  chip_t *chip = ud; chip->al_arduino.ocupado = false; cola_bombear(&chip->al_arduino);
}
static void hecho_telefono(void *ud) {
  chip_t *chip = ud; chip->al_telefono.ocupado = false; cola_bombear(&chip->al_telefono);
}
static void rx_desde_telefono(void *ud, uint8_t b) { chip_t *chip = ud; cola_poner(chip, &chip->al_arduino, b); }
static void rx_desde_arduino(void *ud, uint8_t b)  { chip_t *chip = ud; cola_poner(chip, &chip->al_telefono, b); }

static void fijar_enlace(chip_t *chip, bool on) {
  if (on == chip->enlace) return;
  chip->enlace = on;
  pin_write(chip->state, on ? HIGH : LOW);
  printf("[HC-05] enlace %s (STATE=%d)\n", on ? "establecido" : "perdido", on);
}

static void fin_emparejamiento(void *ud) {
  chip_t *chip = ud;
  chip->emparejado = true;
  fijar_enlace(chip, attr_read(chip->control_cortar) == 0);
}

// Revisa el control "cortar" del panel del chip cada 50 ms.
static void vigilar_control(void *ud) {
  chip_t *chip = ud;
  if (chip->emparejado) fijar_enlace(chip, attr_read(chip->control_cortar) == 0);
}

static const char *GUION[] = {"?", "V1", "R1", "S", "V0", "R0", "P", "XYZ", "E hola desde el HC-05", "V1", "S", NULL};

static void paso_demo(void *ud) {
  chip_t *chip = ud;
  if (!chip->enlace) return;
  const char *s = GUION[chip->paso_demo];
  if (!s) return;
  for (const char *c = s; *c; c++) cola_poner(chip, &chip->al_arduino, (uint8_t)*c);
  cola_poner(chip, &chip->al_arduino, '\n');
  printf("[telefono] -> %s\n", s);
  chip->paso_demo++;
}

void chip_init(void) {
  chip_t *chip = calloc(1, sizeof(chip_t));
  uint32_t baud = attr_read(attr_init("baud", 9600));
  uint32_t t_enlace = attr_read(attr_init("t_enlace_ms", 1500));
  uint32_t demo = attr_read(attr_init("demo", 0));
  chip->control_cortar = attr_init("cortar", 0);

  chip->state = pin_init("STATE", OUTPUT_LOW);

  const uart_config_t lado_modulo = {
    .tx = pin_init("TXD", INPUT_PULLUP),
    .rx = pin_init("RXD", INPUT),
    .baud_rate = baud,
    .rx_data = rx_desde_arduino,
    .write_done = hecho_arduino,
    .user_data = chip,
  };
  chip->al_arduino.uart = uart_init(&lado_modulo);

  const uart_config_t lado_aire = {
    .tx = pin_init("SPP_TX", INPUT_PULLUP),
    .rx = pin_init("SPP_RX", INPUT),
    .baud_rate = baud,
    .rx_data = rx_desde_telefono,
    .write_done = hecho_telefono,
    .user_data = chip,
  };
  chip->al_telefono.uart = uart_init(&lado_aire);

  const timer_config_t te = { .callback = fin_emparejamiento, .user_data = chip };
  chip->t_enlace = timer_init(&te);
  timer_start(chip->t_enlace, t_enlace * 1000, false);

  const timer_config_t tc = { .callback = vigilar_control, .user_data = chip };
  timer_start(timer_init(&tc), 50000, true);

  if (demo) {
    const timer_config_t td = { .callback = paso_demo, .user_data = chip };
    chip->t_demo = timer_init(&td);
    timer_start(chip->t_demo, 700000, true);   // una orden cada 0,7 s
  }
  printf("[HC-05] listo, %u baudios, emparejando...\n", baud);
}
