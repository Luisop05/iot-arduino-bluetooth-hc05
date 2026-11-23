// Contenido del articulo (Entrega 2). Las cifras salen de datos/resultados.json via gen_articulo.js
const fs = require("fs");
const path = require("path");
const G = require("./gen_articulo.js");
const { num, pct, P, H1, H2, VINETA, ECUACION, CODIGO, FIG_COL, TABLA, S, SR, B, V1, OR, fb, fc, fd, fe, ff, cpu,
  A_ok, A_n, hS, hR, hB, W, cfg, R, v1C, v1D, v1ErrTot, v1LoopsMin, v1CpuMax, busyLoopsMed, FUENTE, T, Paragraph, TextRun,
  AlignmentType, ExternalHyperlink, Document, Packer, SectionType, Footer, PageNumber } = G;

const RAIZ = path.resolve(__dirname, "../..");
const ref = (k) => `[${k}]`;
const rep0 = R.reposo_leds_apagados.anfitrion, rep1 = R.reposo_leds_encendidos.anfitrion, rep2 = R.reposo_sin_sondeo.anfitrion;
const cpuS = (h, tsim) => h.cpu_proceso.media / 100 * h.t_real.media / tsim;
const refD = (() => {
  const f = fs.readFileSync(path.join(RAIZ, "datos/v2_sleep_avance_rapido/rep1/cpu_referencia.csv"), "utf8").trim().split("\n").slice(1)
    .map((l) => l.split(",").map(Number)).filter((r) => r[0] > 39.5 && r[0] <= 43.5).map((r) => r[3]);
  return f.reduce((a, b) => a + b, 0) / f.length;
})();
const refC = (() => {
  const f = fs.readFileSync(path.join(RAIZ, "datos/v2_sleep_avance_rapido/rep1/cpu_referencia.csv"), "utf8").trim().split("\n").slice(1)
    .map((l) => l.split(",").map(Number)).filter((r) => r[0] > 30.5 && r[0] <= 38.5).map((r) => r[3]);
  return f.reduce((a, b) => a + b, 0) / f.length;
})();
const telPerdidas = 59 - S.telemetria.length;  // telemetria esperada: t = 1..59 s
const tF = ff.leds_apagados.length ? (ff.leds_apagados[0][0] - 53) * 1000 : NaN;
const evBT0 = ff.eventos_enlace.find((e) => e[1] === "EV BT 0" && e[0] > 50);
const evBT1 = ff.eventos_enlace.filter((e) => e[1] === "EV BT 1").pop();
const gh = cfg.github, wk = (cfg.wokwi && cfg.wokwi.enlace) || "";
const figWokwiRef = fs.existsSync(path.join(RAIZ, "figuras/fig_wokwi.png")) ? " (Fig. 9)" : "";

// ======================= TITULO Y RESUMEN =======================
const titulo = [
  new Paragraph({ children: [new TextRun({ text: "Recepción de órdenes por Bluetooth en un Arduino UNO con el módulo HC-05: enlace serie, firmware no bloqueante y validación en simulación", font: FUENTE, size: 44 })],
    alignment: AlignmentType.CENTER, spacing: { after: 160, line: 260, lineRule: G.LineRuleType.AUTO } }),
  new Paragraph({ children: [new TextRun({ text: cfg.autor, font: FUENTE, size: 22 })], alignment: AlignmentType.CENTER, spacing: { after: 20 } }),
  new Paragraph({ children: [new TextRun({ text: "Módulo Internet de las cosas — Politécnico Grancolombiano", italics: true, font: FUENTE, size: 20 })], alignment: AlignmentType.CENTER, spacing: { after: 20 } }),
  new Paragraph({ children: [new TextRun({ text: "Grupo 5 — Tutor: Jesús Antonio Figueroa Guerrero", font: FUENTE, size: 20 })], alignment: AlignmentType.CENTER, spacing: { after: 20 } }),
  new Paragraph({ children: [new TextRun({ text: cfg.correo, font: "Courier New", size: 18 })], alignment: AlignmentType.CENTER, spacing: { after: 240 } }),
];

const resumen = [
  P(`**Resumen—**Este artículo documenta la segunda entrega del módulo: el diseño, la implementación y la validación en simulación de un circuito en el que un Arduino UNO recibe órdenes por Bluetooth a través del módulo HC-05, conectado al puerto serie (UART) de la placa según el diagrama de la guía. Se revisa el estado del arte de Bluetooth clásico, del perfil de puerto serie y del HC-05, y se desarrolla un firmware no bloqueante con protocolo de órdenes, cola de salida, antirrebote con detección de cambios, modo seguro ante la pérdida del enlace y medición del uso real de CPU. El montaje se validó con un banco de pruebas en simavr con un modelo del HC-05 y un teléfono virtual, y en Wokwi con un chip personalizado. En ${num(fb.ordenes, 0)} órdenes la respuesta mediana tardó ${num(fb.rtt_ms.mediana, 2)} ms y el LED cambió ${num(fb.proc_led_ms.media * 1000, 0)} µs después del último byte; el enlace sostuvo ${num(fc.tasa_entrada_Bps, 0)} B/s de los 960 B/s teóricos sin corromper ninguna línea. Se encontraron y corrigieron dos errores de simavr. Además se mostró que, con el mismo firmware, el costo de simular en el computador varía hasta ${num(rep0.cpu_s_por_s_simulado.media / rep1.cpu_s_por_s_simulado.media, 0)} veces según el estado de dos LED.`, { noIndent: true, run: { bold: true, size: 18 } }),
  P(`**Palabras clave—**Arduino, Bluetooth, HC-05, UART, perfil de puerto serie, simavr, Wokwi, internet de las cosas.`, { noIndent: true, run: { bold: true, size: 18 }, spacing: { before: 80 } }),
  P(`**Abstract—**This paper documents the second assignment of the course: the design, implementation and simulated validation of a circuit in which an Arduino UNO receives commands over Bluetooth through an HC-05 module wired to the board's UART, following the reference diagram. It reviews Classic Bluetooth, the Serial Port Profile and the HC-05, and presents non-blocking firmware with a command protocol, an output queue, debouncing with change detection, a fail-safe mode on link loss and a measurement of actual CPU utilization. The circuit was validated with a simavr testbench that models the HC-05 and a virtual phone, and in Wokwi with a custom chip. Over ${fb.ordenes} commands the median round-trip time was ${fb.rtt_ms.mediana.toFixed(2)} ms and the LED changed ${(fb.proc_led_ms.media * 1000).toFixed(0)} µs after the last byte; the link sustained ${fc.tasa_entrada_Bps.toFixed(0)} B/s out of a theoretical 960 B/s without corrupting any line. Two simavr bugs were found and fixed, and the host cost of simulating the same firmware was shown to vary up to ${(rep0.cpu_s_por_s_simulado.media / rep1.cpu_s_por_s_simulado.media).toFixed(0)}-fold depending on the state of two LEDs.`, { noIndent: true, run: { bold: true, size: 18 }, spacing: { before: 80 } }),
  P(`**Index Terms—**Arduino, Bluetooth, HC-05, UART, Serial Port Profile, simavr, Wokwi, Internet of Things.`, { noIndent: true, run: { bold: true, size: 18 }, spacing: { before: 80 } }),
];

// ======================= I. INTRODUCCION =======================
const intro = [
  H1("I", "Introducción"),
  P(`En la primera entrega se implementó y monitoreó en simulación un montaje de cinco salidas y dos entradas ${ref(1)}. Esta segunda entrega añade comunicación inalámbrica: la guía pide diseñar, implementar y configurar un circuito que reciba señales por Bluetooth en una tarjeta Arduino, configurar el enlace serie de la placa y simularlo con sus pruebas, siguiendo un diagrama con un módulo HC-05 y dos LED.`),
  P(`El trabajo incorpora las observaciones de la entrega anterior: (i) las entradas se filtran con antirrebote y se procesan por detección de cambios, de modo que una orden o un evento se aplica en la misma iteración en que se detecta; (ii) se distingue entre iteraciones de loop() por segundo y uso real de CPU, que se mide dentro del firmware y se valida contra una referencia exacta del simulador; y (iii) se comprueba experimentalmente que el costo de simular en el computador sí depende del firmware. El código, los archivos de configuración, los scripts, el banco de pruebas y los registros originales están publicados (Apéndice A). La actividad se realizó de forma individual: el autor reside en Madrid y la diferencia horaria con el grupo impidió coordinar el trabajo.`),
  P(`La sección II presenta el estado del arte; la III, el diseño y la implementación; la IV, los resultados, y la V, las conclusiones.`),
];

// ======================= II. ESTADO DEL ARTE =======================
const arte = [
  H1("II", "Estado del arte"),
  H2("A", "Bluetooth clásico y el perfil de puerto serie"),
  P(`Bluetooth es una tecnología de radio de corto alcance supervisada por el Bluetooth Special Interest Group (SIG), fundado en 1998 ${ref(2)}. Su versión clásica (BR/EDR) opera en la banda ISM de 2,4 GHz con 79 canales de 1 MHz y salto de frecuencia de hasta 1 600 saltos por segundo; un maestro forma una *piconet* con hasta siete esclavos activos ${ref(3)}. Sobre el enlace, el protocolo RFCOMM emula un cable serie y el perfil de puerto serie (SPP) lo expone a las aplicaciones como un puerto COM virtual ${ref(4)}. Para un microcontrolador esto significa que el teléfono y la placa intercambian bytes como si estuvieran unidos por un cable.`),
  H2("B", "Bluetooth de baja energía y evolución reciente"),
  P(`Bluetooth 4.0 introdujo Bluetooth Low Energy (BLE), diseñado para control y monitoreo con bajo consumo; Gomez *et al.* ${ref(5)} cuantificaron su compromiso entre consumo, latencia y rendimiento. Bluetooth 5 amplió alcance, velocidad y capacidad de anuncio pensando en IoT ${ref(6)}, y en septiembre de 2024 el SIG publicó la especificación 6.0, cuya novedad principal es *Channel Sounding* para medir distancias con precisión centimétrica ${ref(2)}. Koulouras *et al.* ${ref(7)} revisan esta evolución y el papel de BLE en el ecosistema IoT. BLE no ofrece SPP: los módulos clásicos como el HC-05 siguen siendo la vía más directa para enlazar un UNO con un teléfono como si fuera un puerto serie.`),
  H2("C", "El módulo HC-05"),
  P(`El HC-05 es un módulo SPP pensado para conexiones serie inalámbricas transparentes, basado en el chip CSR BC417, con Bluetooth 2.0+EDR ${ref(8)}, ${ref(9)}. Puede actuar como maestro o esclavo y se configura con órdenes AT (nombre, clave, rol, velocidad) en un modo que se activa con el pin KEY/EN; en ese modo trabaja a 38 400 baudios, mientras que en modo de datos la configuración de fábrica es 9 600 baudios, 8 bits, sin paridad y un bit de parada ${ref(9)}, ${ref(10)}. El pin STATE indica si hay enlace. La placa de conexión admite alimentación de 3,6 a 6 V, pero sus líneas TXD y RXD son de 3,3 V, por lo que la línea TX de un Arduino de 5 V debe pasar por un divisor de tensión, típicamente de 1 kΩ y 2 kΩ ${ref(10)}.`),
  H2("D", "El enlace serie del ATmega328P"),
  P(`El USART del ATmega328P genera la velocidad a partir del reloj y del registro UBRR; con el modo de doble velocidad (U2X), que usa el núcleo de Arduino, la velocidad real es f/(8·(UBRR+1)) ${ref(11)}. La biblioteca HardwareSerial de Arduino gestiona la recepción y la transmisión por interrupciones con buffers circulares de 64 bytes; *Serial.availableForWrite()* informa del espacio libre en el buffer de salida ${ref(12)}, y cuando ese buffer se llena, *Serial.print()* espera, es decir, bloquea el programa.`),
  H2("E", "Trabajos relacionados"),
  P(`El control de dispositivos desde un teléfono por Bluetooth con Arduino es una aplicación clásica: Piyare y Tazil ${ref(13)} presentaron un sistema domótico con Arduino BT, y trabajos recientes usan el UNO con el HC-05 para controlar instalaciones residenciales ${ref(14)} o una vivienda inteligente con RFID ${ref(15)}. La revisión de Kondaveeti *et al.* ${ref(16)} señala que muchos prototipos con Arduino se validan de forma funcional pero rara vez reportan latencias, pérdidas o carga del microcontrolador. Este trabajo apunta a esa brecha.`),
  H2("F", "Simulación de enlaces Bluetooth"),
  P(`Ninguno de los simuladores revisados en la entrega 1 modela la radio Bluetooth ${ref(1)}. Lo habitual es sustituir el módulo por lo que hace eléctricamente, un puente UART. simavr permite conectar dispositivos virtuales a las señales del UART y de los puertos por medio de IRQ y temporizadores de ciclo ${ref(17)}. Wokwi permite crear chips personalizados en C con una API de UART ${ref(18)} y conectar su monitor serie a pines arbitrarios del diagrama ${ref(19)}. Ambos mecanismos se usan aquí.`),
];

// ======================= III. DISENO E IMPLEMENTACION =======================
const disenio = [
  H1("III", "Diseño e implementación"),
  H2("A", "Circuito"),
  P(`La Fig. 1 muestra el esquema, que sigue la Fig. 2 de la guía: TXD del HC-05 a D0 (RX del UNO), RXD a D1 (TX) y alimentación de 5 V; LED verde en D2 y LED rojo en D3, cada uno con 220 Ω. Se agregaron tres elementos: el divisor de 1 kΩ y 2 kΩ en la línea RXD, que el diagrama de la guía omite y que reduce los 5 V de D1 al nivel del módulo según (1); el pin STATE del HC-05 en D5, para que el firmware sepa si hay enlace; y un pulsador en D4 a GND con el pull-up interno, que produce eventos en sentido contrario (de la placa al teléfono).`),
  ECUACION("V_RXD = 5 V · 2 kΩ / (1 kΩ + 2 kΩ) = 3,33 V", 1),
  ...FIG_COL("fig_esquema.png", "Esquema del montaje. Se agregan al diagrama de la guía el divisor de tensión en RXD, el pin STATE en D5 y un pulsador en D4."),
  P(`Como D0 y D1 son también el puerto USB de la placa, en el montaje físico el HC-05 debe desconectarse al grabar el programa; en compensación, el monitor serie del computador ve el mismo tráfico que recibe el teléfono, lo que facilita la depuración.`),
  H2("B", "Configuración del enlace serie"),
  P(`El enlace usa la configuración de fábrica del HC-05: 9 600 baudios, 8N1. Con f = 16 MHz y U2X, el núcleo de Arduino programa UBRR = 207, de modo que la velocidad real es`),
  ECUACION("baud = 16·10⁶ / (8 · 208) = 9 615,4 baudios (+0,16 %)", 2),
  P(`un error muy por debajo del margen de ±2 % que tolera un UART. Cada byte ocupa 10 bits (inicio, 8 de datos y parada), así que`),
  ECUACION("B_máx = baud / 10 ≈ 960 B/s;   t_byte ≈ 1,04 ms", 3),
  P(`son el rendimiento máximo y el tiempo por byte en cada sentido. Estos valores fijan la referencia teórica para las pruebas.`),
  H2("C", "Protocolo de órdenes"),
  P(`Las órdenes son líneas de texto terminadas en '\\n' o '\\r', sin distinguir mayúsculas, para que funcionen con cualquier aplicación de terminal Bluetooth del teléfono. La Tabla I las resume. Además, la placa envía eventos sin que se los pidan (cambio del pulsador o del enlace) y una línea de telemetría CSV por segundo.`),
  ...TABLA("Protocolo sobre el enlace SPP", ["Orden", "Acción", "Respuesta"], [
    ["V1 / V0", "LED verde encendido / apagado", "OK V1 / OK V0"],
    ["R1 / R0", "LED rojo encendido / apagado", "OK R1 / OK R0"],
    ["S", "Estado completo", "ST V=… R=… CPU=…"],
    ["P", "Prueba de conectividad", "PONG n"],
    ["E texto", "Eco (integridad)", "E texto"],
    ["?", "Ayuda", "lista de órdenes"],
    ["otra / >48 car.", "Rechazo", "ERR orden / ERR LARGO"],
    ["(evento)", "Pulsador / enlace", "EV BTN 0|1 / EV BT 0|1"],
    ["(cada 1 s)", "Telemetría", "#T,t,cpu,loops,…"],
  ], [1080, 1820, 2140]),
  H2("D", "Firmware"),
  P(`El programa (Apéndice B) sigue cuatro principios. **Nada bloquea:** no usa delay() y las respuestas no se escriben con Serial.print() directo, sino que cada línea se copia completa a una cola de salida de 256 bytes que se vacía hacia el UART solo cuando *availableForWrite()* indica espacio. Si la cola se llena por saturación, la línea se descarta entera y se cuenta, pero nunca sale cortada ni detiene el programa. **Las órdenes se aplican al detectarse:** al llegar el fin de línea se ejecuta la orden y se actualiza el LED en la misma iteración. **Las entradas se filtran:** el pulsador y STATE pasan por un antirrebote por tiempo, en el que un cambio solo se acepta si el nivel permanece estable 30 ms (los rebotes típicos duran 1,5 ms y rara vez superan 6,2 ms ${ref(20)}), y generan un evento solo cuando cambia el estado estable. **Modo seguro:** si STATE indica que el enlace se perdió, ambos LED se apagan.`),
  P(`Para medir la carga real, la CPU duerme en modo *idle* cuando no tiene nada que hacer y la despierta cualquier interrupción (un byte recibido o el tic de millis() cada 1,024 ms). El tiempo dormido se mide con el Timer1 (0,5 µs por cuenta) y el uso de CPU de cada ventana de 1 s es`),
  ECUACION("U = 1 − t_dormido / t_ventana", 4),
  P(`El firmware informa por separado U y las iteraciones de loop() por segundo, para mostrar que son magnitudes distintas. Compilado con avr-gcc 7.3 y el núcleo oficial ArduinoCore-avr, ocupa 7 236 bytes de flash (22,1 %) y 664 bytes de SRAM (32,4 %), de los cuales 256 corresponden a la cola de salida.`),
  H2("E", "Banco de pruebas en simavr"),
  P(`El banco de pruebas, escrito en C sobre la biblioteca de simavr, carga el mismo archivo ELF en un ATmega328P a 16 MHz y le conecta tres modelos. El primero es el **HC-05**, un puente UART transparente a la velocidad del enlace con su pin STATE: sin enlace descarta los bytes en ambos sentidos, como el módulo real. El segundo es un **teléfono virtual** que ejecuta un guion y registra con marca de tiempo cada byte enviado y cada línea recibida. El tercero es un **pulsador** con rebotes (siete cambios de nivel en 4,5 ms). El banco registra también los cambios de los LED y, como referencia exacta para validar (4), los ciclos que la CPU pasa dormida. La radio no se simula, así que no se incluye latencia de aire: las cifras corresponden al tramo serie del enlace.`),
  P(`El guion dura 60 s simulados y tiene seis fases: (A) prueba funcional de todas las órdenes con distintos finales de línea; (B) ${fb.ordenes} órdenes a intervalos aleatorios de 40 a 80 ms para medir latencias; (C) eco de líneas de 32 bytes sin pausas, a la velocidad máxima del enlace; (D) inundación con ${fd.consultas_enviadas} consultas "S", cuya respuesta es unas 28 veces más larga que la orden; (E) cinco pulsaciones con rebotes y un pico de 5 ms que debe ignorarse; y (F) caída del enlace, una orden enviada sin enlace y reconexión. Antes de enlazar, a 1 s, se envía además una orden que debe perderse.`),
  P(`La Fig. 2 muestra la salida real de la terminal: memoria ocupada por el firmware, una ejecución completa del guion (60 s simulados) y las primeras líneas recibidas por el teléfono virtual.`),
  ...FIG_COL("fig_terminal.png", "Salida de la terminal: compilación del firmware, ejecución del banco de pruebas en simavr y primeras líneas recibidas por el teléfono virtual."),
  P(`Un script en Python con psutil ejecuta cada configuración cinco veces y muestrea cada 0,5 s la CPU del proceso simulador, la CPU total, la memoria residente y la memoria del sistema, con 5 s de línea base antes y después; además registra el tiempo de CPU exacto del proceso. El anfitrión fue una máquina Ubuntu 24.04 de 2 núcleos y 8 GB.`),
  H2("F", "Dos errores de simavr y su corrección"),
  P(`Las primeras ejecuciones mostraron pérdidas de bytes que no correspondían al firmware. El análisis del código fuente de simavr 1.6 reveló dos errores. **(a) Paridad:** el UART calcula la duración de un byte con 1 + 8 + 1 + 1 bits, es decir, cuenta siempre un bit de paridad aunque la trama sea 8N1. Así simula 874 B/s en lugar de 961, un 9 % menos; el error sigue presente en la versión de desarrollo (noviembre de 2026). Se corrigió con un parche de dos líneas que solo cuenta la paridad si los bits UPM la activan. **(b) Pull-up:** cada escritura del firmware en PORTD (por ejemplo, al encender un LED) volvía a aplicar el pull-up interno de D4 por encima del pulsador externo, simulando una liberación falsa; se resolvió declarando el nivel externo de D4 y D5 con la interfaz del puerto, que tiene prioridad. Además, el modelo del HC-05 entrega cada byte cuando el UART simulado ya consumió el anterior, para no desbordar el FIFO interno de simavr, que no existe en el chip real. El parche y el banco se publican con el resto del código.`),
  H2("G", "Simulación en Wokwi"),
  P(`En Wokwi el mismo sketch se ejecuta con un chip personalizado que emula el HC-05${figWokwiRef}. Tiene los pines del módulo (TXD, RXD, STATE, VCC, GND) unidos a D0, D1 y D5, y dos pines adicionales que representan el lado de radio y se conectan al monitor serie de Wokwi, que hace las veces de aplicación de terminal Bluetooth del teléfono. El chip implementa el puente con dos UART y colas de 256 bytes, activa STATE tras un emparejamiento simulado de 1,5 s y ofrece un control para cortar y restablecer el enlace. El diagrama incluye además el pulsador, cuyos rebotes simula Wokwi, y un analizador lógico en D0–D5.`),
];

// ======================= IV. RESULTADOS =======================
const ratioRep = rep0.cpu_s_por_s_simulado.media / rep1.cpu_s_por_s_simulado.media;
const ratioSin = rep0.cpu_s_por_s_simulado.media / rep2.cpu_s_por_s_simulado.media;
const resultados = [
  H1("IV", "Resultados"),
  P(`Las cinco repeticiones de cada configuración produjeron registros del firmware idénticos byte a byte, porque el emulador es determinista. Lo único que varía entre ejecuciones son los indicadores del computador. Salvo que se indique otra cosa, las cifras corresponden al firmware final (v2) con sleep.`),
  H2("A", "Funcionamiento y conectividad"),
  P(`La Fig. 3 resume los 60 s de prueba. En la fase A, las ${A_n} órdenes recibieron la respuesta esperada, incluidos los finales de línea '\\r', '\\n' y "\\r\\n", la orden desconocida (ERR XYZ) y la línea de 54 caracteres (ERR LARGO). La orden enviada a 1 s, sin enlace, no llegó a la placa. En la fase F, al caer el enlace a los 53 s, el LED verde se apagó ${num(tF, 0)} ms después, los 30 ms del antirrebote de STATE más el tiempo de una iteración, y el evento EV BT 0 se envió por el puerto serie. La orden R1 enviada sin enlace se perdió. Tras la reconexión, a los 55,5 s, la placa avisó EV BT 1 y las órdenes S, V1 y P se atendieron con normalidad.`),
  ...FIG_COL("fig_linea_tiempo.png", "Prueba completa de 60 s en simavr: estado de los LED, del pin STATE y del pulsador (arriba) y bytes por segundo recibidos por el UNO (abajo). Las franjas marcan las fases A–F."),
  H2("B", "Latencia"),
  P(`Las ${fb.ordenes} órdenes de la fase B se atendieron todas (Fig. 4). El tiempo de ida y vuelta, medido por el teléfono desde el primer bit de la orden hasta el último de la respuesta, tuvo una mediana de ${num(fb.rtt_ms.mediana, 2)} ms y un percentil 95 de ${num(fb.rtt_ms.p95, 2)} ms. Casi todo es tiempo de línea: "P\\n" ocupa 2 bytes y "PONG n\\r\\n" entre 8 y 10, unos 10,4–12,5 ms según (3). Los valores atípicos, de hasta ${num(fb.rtt_ms.max, 1)} ms, son órdenes que coincidieron con la línea de telemetría y esperaron en la cola de salida. Por su parte, el LED cambió en promedio ${num(fb.proc_led_ms.media * 1000, 0)} µs después del último byte de la orden (máximo ${num(fb.proc_led_ms.max * 1000, 0)} µs): el procesamiento del firmware es unas cien veces más rápido que la transmisión de un solo byte.`),
  ...FIG_COL("fig_latencias.png", `Fase B: (a) tiempo de ida y vuelta de ${fb.ordenes} órdenes (escala logarítmica) y (b) tiempo entre el último byte de la orden y el cambio del LED.`),
  H2("C", "Rendimiento, saturación y bloqueo"),
  P(`En la fase C el teléfono envió ${fc.lineas_enviadas} líneas de eco a ${num(fc.tasa_entrada_Bps, 0)} B/s, el 99,5 % del máximo de (3). Volvieron ${fc.ecos_intactos} intactas, ninguna corrupta; las ${fc.lineas_enviadas - fc.ecos_recibidos} restantes se descartaron completas porque la salida debía transportar, además de los ecos, la telemetría. En la fase D, con un pedido de 2 bytes que genera una respuesta de unos 56, la salida se satura. El firmware procesó las ${fd.procesadas} consultas sin un solo error, entregó ${fd.respuestas_recibidas} respuestas y descartó completas las ${fd.procesadas - fd.respuestas_recibidas} restantes. En las fases C y D también se descartaron ${telPerdidas} de las 59 líneas de telemetría, lo que sugiere reservarle espacio en una versión futura.`),
  P(`La primera versión del firmware (v1), que respondía con Serial.print() directo, permite ver el efecto del bloqueo (Fig. 5). Con la salida saturada, cada respuesta esperaba a que hubiera espacio en el buffer. Las iteraciones de loop() cayeron hasta ${num(v1LoopsMin, 0)} por segundo, el uso de CPU llegó al ${pct(v1CpuMax)}, todo en espera activa, y el buffer de recepción se desbordó: en la fase D solo se procesaron ${v1D.procesadas} de ${v1D.consultas_enviadas} consultas y a lo largo de la prueba ${num(v1ErrTot - 2, 0)} órdenes llegaron mutiladas y se rechazaron como erróneas; una de ellas fue la V1 de la fase F, que se fusionó con el resto de una consulta de la inundación ("SV1"). La v2 atendió todo sin errores. Esta comparación motivó el diseño de la cola de salida.`),
  ...FIG_COL("fig_v1_v2.png", "Fases C y D con la versión bloqueante (v1) y con la cola de salida (v2): iteraciones de loop() por segundo y órdenes erróneas acumuladas."),
  H2("D", "Antirrebote y detección de cambios"),
  P(`En la fase E se inyectaron ${fe.flancos_inyectados} flancos en D4 (cinco pulsaciones y cinco liberaciones con rebotes, más un pico de 5 ms). El firmware generó exactamente ${fe.eventos_pulsar} eventos de pulsación y ${fe.eventos_soltar} de liberación, ignoró el pico y conmutó el LED rojo ${fe.conmutaciones_led_rojo} veces. La conmutación ocurrió en promedio ${num(fe.primer_flanco_a_led_ms.media, 1)} ms después del primer flanco (Fig. 6): 4,5 ms de rebote más los 30 ms de estabilidad exigidos, sin la latencia de hasta un intervalo de parpadeo observada en la entrega 1 ${ref(1)}.`),
  ...FIG_COL("fig_rebote.png", "Detalle de una pulsación: rebotes en D4 y conmutación del LED rojo (D3) tras 30 ms de nivel estable."),
  H2("E", "Uso de CPU del microcontrolador"),
  P(`La Fig. 7 separa las dos magnitudes que la entrega 1 había mezclado. Con sleep, la CPU estuvo activa en reposo el ${pct(cpu.reposo_referencia_pct, 2)} del tiempo según simavr, y el firmware midió ${pct(cpu.reposo_firmware_pct, 2)}; con el eco a máxima velocidad subió a ~${num(refC, 0)} % y con la inundación a ~${num(refD, 0)} %. Mientras tanto, loop() giró unas ${num(cpu.loops_reposo, 0)} veces por segundo, una por cada interrupción. Sin sleep, el mismo firmware hace el mismo trabajo útil, pero loop() gira ${num(busyLoopsMed, 0)} veces por segundo y la CPU está ocupada el 100 % del tiempo, aunque casi todas esas vueltas no hacen nada. Las iteraciones por segundo miden, por tanto, cuánto tarda una vuelta vacía, no cuánta capacidad queda libre. La medición del firmware subestima la referencia en ${num(cpu.error_medio_pp, 2)} puntos de media, porque cuenta como tiempo dormido las rutinas de interrupción que se ejecutan al despertar. Es un error conocido y acotado.`),
  ...FIG_COL("fig_cpu.png", "Uso de CPU del ATmega328P (arriba, escala logarítmica) e iteraciones de loop() por segundo (abajo), con y sin sleep. En las fases C y D la telemetría del firmware se descarta parcialmente por saturación."),
  H2("F", "Indicadores del sistema operativo"),
  P(`La Tabla II y la Fig. 8 resumen el costo en el computador. En la entrega 1 se concluyó que ese costo no dependía del programa ${ref(1)}. Los datos de ahora lo desmienten. Con el guion completo, simular 60 s llevó ${num(hB.t_real.media, 1)} s sin sleep y ${num(hS.t_real.media, 1)} s con sleep; en ambos casos el proceso usó casi un núcleo entero (${pct(hB.cpu_proceso.media)} y ${pct(hS.cpu_proceso.media)}). En modo sincronizado con el reloj real, el modo por defecto de simavr cuando el AVR duerme, tardó ${num(hR.t_real.media, 1)} s pero aún ocupó el ${pct(hR.cpu_proceso.media)} de un núcleo.`),
  P(`La causa es más llamativa. Mientras D2 y D3 (los pines de INT0 e INT1) están en nivel bajo, simavr los consulta cada pocos ciclos para emular la interrupción por nivel, aunque esté deshabilitada, y eso le impide avanzar rápido durante el sueño. Un experimento de reposo de 20 s lo confirma: con los LED apagados, cada segundo simulado costó ${num(rep0.cpu_s_por_s_simulado.media, 3)} s de CPU; con los LED encendidos, ${num(rep1.cpu_s_por_s_simulado.media, 3)} s (${num(ratioRep, 0)} veces menos), y desactivando esa consulta, ${num(rep2.cpu_s_por_s_simulado.media, 3)} s (${num(ratioSin, 0)} veces menos). En los tres casos el microcontrolador estaba activo ~3 % del tiempo. La memoria, en cambio, sí fue estable: unos ${num(hS.rss.media, 1)} MB por proceso, sin cambios apreciables en la memoria del sistema.`),
  ...FIG_COL("fig_anfitrion.png", "CPU del computador por segundo simulado (escala logarítmica; media y desviación de 5 ejecuciones). Arriba, el guion completo; abajo, 20 s de reposo con el mismo firmware."),
  ...TABLA("Resumen de mediciones", ["Indicador", "Valor"], [
    ["Flash / SRAM del firmware", "7 236 B (22,1 %) / 664 B (32,4 %)"],
    ["Órdenes correctas (fases A y B)", `${A_ok + fb.correctas} / ${A_n + fb.ordenes}`],
    ["Ida y vuelta: mediana / p95", `${num(fb.rtt_ms.mediana, 2)} / ${num(fb.rtt_ms.p95, 2)} ms`],
    ["Último byte → LED (media)", `${num(fb.proc_led_ms.media * 1000, 0)} µs`],
    ["Rendimiento sostenido (fase C)", `${num(fc.tasa_entrada_Bps, 0)} B/s de 960; 0 líneas corruptas`],
    ["Saturación (fase D), v2 / v1", `${fd.procesadas} / ${v1D.procesadas} de ${fd.consultas_enviadas} procesadas`],
    ["Pulsaciones detectadas", `${fe.eventos_pulsar} de 5 (${fe.flancos_inyectados} flancos)`],
    ["CPU AVR en reposo: firmware / ref.", `${pct(cpu.reposo_firmware_pct, 2)} / ${pct(cpu.reposo_referencia_pct, 2)}`],
    ["loop()/s en reposo: con / sin sleep", `${num(cpu.loops_reposo, 0)} / ${num(busyLoopsMed, 0)}`],
    ["Tiempo para 60 s: sin sleep / con sleep", `${num(hB.t_real.media, 1)} ± ${num(hB.t_real.desv, 1)} / ${num(hS.t_real.media, 1)} ± ${num(hS.t_real.desv, 1)} s`],
    ["CPU anfitrión por s simulado (reposo)", `${num(rep0.cpu_s_por_s_simulado.media, 3)} (LED apag.) / ${num(rep1.cpu_s_por_s_simulado.media, 3)} (LED enc.) s`],
    ["Memoria residente del simulador", `${num(hS.rss.media, 2)} ± ${num(hS.rss.desv, 2)} MB`],
    ["simavr original vs. corregido (fase C)", `${num(OR.fase_C.tasa_entrada_Bps, 0)} vs. ${num(fc.tasa_entrada_Bps, 0)} B/s`],
    ["Wokwi (reposo): CPU AVR / loop()/s", `${pct(W.cpu_pct)} / ${num(W.loops_por_s, 0)}`],
  ], [2560, 2480]),
  H2("G", "Verificación en Wokwi"),
  P(`En Wokwi${figWokwiRef} el chip HC-05 estableció el enlace tras el emparejamiento simulado y la placa lo detectó por STATE. Las órdenes escritas en el monitor serie, que hace de teléfono, llegaron a través del chip al UART del UNO y produjeron las mismas respuestas que en simavr: "OK R1" encendió el LED rojo, P respondió "PONG 1", XYZ fue rechazada y el eco volvió intacto (Fig. 9). Con el pulsador, tres pulsaciones de 300 ms produjeron exactamente tres pares EV BTN 1/0 y tres conmutaciones del LED rojo; en cambio, tres clics sintéticos de pocos milisegundos no generaron ningún evento, porque no alcanzan los 30 ms de nivel estable que exige el antirrebote. Al cortar el enlace desde el control del chip, el monitor dejó de recibir datos, la orden V1 enviada durante el corte se perdió y el modo seguro apagó los LED; al restablecerlo, la placa avisó EV BT 1 y la consulta S confirmó V=0 R=0 BT=1 (Fig. 10).`),
  P(`Hubo una diferencia instructiva: en Wokwi el firmware midió en reposo una CPU activa del ${pct(W.cpu_pct)} y ${num(W.loops_por_s, 0)} iteraciones por segundo, valores propios de un lazo sin sleep. Esto indica que su emulador no detiene el núcleo con la instrucción SLEEP. El comportamiento funcional es idéntico, pero las métricas de consumo dependen del simulador.`),
];

// ======================= V. CONCLUSIONES =======================
const conclusiones = [
  H1("V", "Conclusiones"),
  P(`El circuito de la guía, completado con el divisor de tensión que protege la entrada de 3,3 V del HC-05 y con el pin STATE, recibe órdenes por Bluetooth de forma fiable. Para el microcontrolador, el HC-05 es un puerto serie de 9 600 baudios, 8N1, y el enlace queda limitado por ese UART: unos 960 B/s y 1,04 ms por byte. Una orden tarda ~10 ms en ir y volver, de los cuales el firmware aporta unas decenas de microsegundos.`),
  P(`Las observaciones de la entrega 1 cambiaron el diseño y las conclusiones. El antirrebote con detección de cambios convirtió ${fe.flancos_inyectados} flancos en exactamente cinco pulsaciones, y las órdenes se aplican en la misma iteración en que llegan. Medir la CPU dentro del firmware mostró que las iteraciones de loop() por segundo no indican la carga: el mismo programa gira ${num(cpu.loops_reposo, 0)} o ${num(busyLoopsMed, 0)} veces por segundo según duerma o no, con el mismo trabajo útil. Y el costo de simular en el computador sí depende del firmware y del simulador: en simavr, el estado de dos LED cambió ese costo en un factor de ${num(ratioRep, 0)}.`),
  P(`La comparación entre versiones dejó una lección de diseño: un Serial.print() bloqueante bajo saturación detiene todo el programa y corrompe órdenes, mientras que una cola de salida no bloqueante mantiene el sistema atendiendo y degrada el servicio de forma controlada. Por último, la simulación es útil siempre que se verifique el propio simulador: los dos errores encontrados en simavr habrían falseado en un 9 % el rendimiento del enlace y el comportamiento del pulsador. La próxima entrega sustituirá el HC-05 por un ESP8266 para llevar estos datos por IP.`),
];

// ======================= APENDICES =======================
const linkP = (et, url) => new Paragraph({ children: [new TextRun({ text: et, font: FUENTE, size: T }),
  url ? new ExternalHyperlink({ link: url, children: [new TextRun({ text: url, style: "Hyperlink", font: FUENTE, size: 18 })] }) : new TextRun({ text: "(pendiente)", font: FUENTE, size: T })],
  spacing: { after: 40 } });
const apA = [
  H1("", "Apéndice A: enlaces del proyecto"),
  linkP("Repositorio (código, banco de pruebas, scripts y registros): ", gh),
  linkP("Circuito en Wokwi: ", wk),
  P(`Para reproducir los resultados: instalar gcc-avr, avr-libc, simavr y libsimavr-dev; compilar el firmware y el banco con make; aplicar el parche de simavr; y ejecutar scripts/campana.py, scripts/analisis.py y scripts/figuras.py. Los registros originales de cada ejecución están en la carpeta datos/.`, { noIndent: true }),
];
const sketch = fs.readFileSync(path.join(RAIZ, "firmware/bt_hc05/bt_hc05.ino"), "utf8").replace(/\t/g, "  ").split("\n");
const apB = [H1("", "Apéndice B: código completo del firmware"), ...CODIGO(sketch)];

// ======================= REFERENCIAS =======================
const REFS = [
  `L. E. Ortiz Perea, "Implementación y monitoreo de un montaje blink con cinco salidas y dos entradas sensoriales en Arduino UNO mediante simulación," Entrega 1, Módulo Internet de las cosas, Politécnico Grancolombiano, 2026.`,
  `Bluetooth SIG, "Bluetooth SIG introduces true distance awareness," comunicado de prensa, 3 sep. 2024. [En línea]. Disponible: https://www.bluetooth.com/press/bluetooth-channel-sounding/`,
  `Bluetooth SIG, Bluetooth Core Specification, v6.0, vol. 2: BR/EDR Controller, Kirkland, WA, EE. UU., 2024.`,
  `Bluetooth SIG, Serial Port Profile (SPP), v1.2, Kirkland, WA, EE. UU., 2012.`,
  `C. Gomez, J. Oller y J. Paradells, "Overview and evaluation of Bluetooth Low Energy: An emerging low-power wireless technology," Sensors, vol. 12, no. 9, pp. 11734–11753, 2012, doi: 10.3390/s120911734.`,
  `M. Collotta, G. Pau, T. Talty y O. K. Tonguz, "Bluetooth 5: A concrete step forward toward the IoT," IEEE Commun. Mag., vol. 56, no. 7, pp. 125–131, 2018, doi: 10.1109/MCOM.2018.1700053.`,
  `G. Koulouras, S. Katsoulis y F. Zantalis, "Evolution of Bluetooth technology: BLE in the IoT ecosystem," Sensors, vol. 25, no. 4, art. 996, 2025, doi: 10.3390/s25040996.`,
  `ITead Studio, HC-05 – Bluetooth to Serial Port Module, hoja de datos, jun. 2010.`,
  `HC-03/05 Embedded Bluetooth Serial Communication Module: AT Command Set, rev. abr. 2011.`,
  `M. Currey, "Arduino and HC-05 in communication mode." [En línea]. Disponible: https://www.martyncurrey.com/?p=1294`,
  `Microchip Technology, ATmega48A/PA/88A/PA/168A/PA/328/P Data Sheet. Chandler, AZ, EE. UU.: Microchip, 2020.`,
  `Arduino, "Serial," Arduino Language Reference. [En línea]. Disponible: https://docs.arduino.cc/language-reference/en/functions/communication/serial/`,
  `R. Piyare y M. Tazil, "Bluetooth based home automation system using cell phone," en Proc. IEEE 15th Int. Symp. Consumer Electronics (ISCE), Singapur, 2011, pp. 192–195, doi: 10.1109/ISCE.2011.5973811.`,
  `A. Nelwan, P. Manembu, A. Wauran, F. Manoppo y C. Mamahit, "Wireless residential electric controller using Arduino Uno and Bluetooth module HC-05," J. Edunitro, vol. 3, no. 1, 2023, doi: 10.53682/edunitro.v3i1.5408.`,
  `I. Fenriana, D. S. D. Putra, B. Dermawan y Y. Kurnia, "Smart home prototype with HC-05 Bluetooth and RFID modules, based on microcontroller," bit-Tech, vol. 5, no. 2, 2022, doi: 10.32877/bt.v5i2.564.`,
  `H. K. Kondaveeti, N. K. Kumaravelu, S. D. Vanambathina, S. E. Mathe y S. Vappangi, "A systematic literature review on prototyping with Arduino: Applications, challenges, advantages, and limitations," Comput. Sci. Rev., vol. 40, art. 100364, 2021, doi: 10.1016/j.cosrev.2021.100364.`,
  `M. Pollet, "simavr: a lean, mean and hackable AVR simulator for Linux & OSX," GitHub. [En línea]. Disponible: https://github.com/buserror/simavr`,
  `Wokwi, "UART API," Wokwi Custom Chips Documentation. [En línea]. Disponible: https://docs.wokwi.com/chips-api/uart`,
  `Wokwi, "Serial Monitor," Wokwi Documentation. [En línea]. Disponible: https://docs.wokwi.com/guides/serial-monitor`,
  `J. G. Ganssle, "A guide to debouncing," The Ganssle Group, rev. 3, jun. 2008. [En línea]. Disponible: https://www.ganssle.com/debouncing.htm`,
];
const refsP = [H1("", "Referencias"), ...REFS.map((r, i) => new Paragraph({
  children: [new TextRun({ text: `[${i + 1}]`, font: FUENTE, size: 16 }), new TextRun({ text: "\t" + r, font: FUENTE, size: 16 })],
  tabStops: [{ type: "left", position: 360 }], indent: { left: 360, hanging: 360 }, alignment: AlignmentType.LEFT, spacing: { after: 30 },
}))];

// ======================= FIGURA WOKWI (si existe) =======================
const figWokwi = fs.existsSync(path.join(RAIZ, "figuras/fig_wokwi.png"))
  ? [...G.FIG_COL("fig_wokwi.png", "Simulación en Wokwi: chip personalizado HC-05 (arriba), UNO, LED, pulsador y analizador lógico. En el monitor serie, que hace de teléfono, se ven las respuestas a R1, P, XYZ y al eco; ambos LED están encendidos."),
     ...G.FIG_COL("fig_wokwi_enlace.png", "Monitor serie de Wokwi tras cortar y restablecer el enlace: no llegan datos durante el corte, la placa avisa EV BT 1 al reconectar y el estado muestra los LED apagados por el modo seguro.")]
  : [];

// ======================= DOCUMENTO =======================
const margen = { top: 1080, bottom: 1080, left: 900, right: 900 };
const pagina = { size: { width: 12240, height: 15840 }, margin: margen };
const cuerpo = [...resumen, ...intro, ...arte, ...disenio, ...resultados, ...figWokwi, ...conclusiones, ...apA, ...refsP];
const doc = new Document({
  creator: cfg.autor, title: "Uso práctico de Arduino – Entrega 2", description: "Artículo IEEE, Entrega 2",
  styles: { default: { document: { run: { font: FUENTE, size: T } } },
    characterStyles: [{ id: "Hyperlink", name: "Hyperlink", run: { color: "0563C1", underline: {} } }] },
  sections: [
    { properties: { page: pagina }, children: titulo },
    { properties: { type: SectionType.CONTINUOUS, page: pagina, column: { count: 2, space: 360 } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FUENTE, size: 16 })] })] }) },
      children: cuerpo },
    { properties: { type: SectionType.CONTINUOUS, page: pagina, column: { count: 1 } }, children: apB },
  ],
});
Packer.toBuffer(doc).then((b) => {
  const out = path.join(__dirname, "Entrega2_Arduino_IEEE_Ortiz_Perea.docx");
  fs.writeFileSync(out, b);
  console.log("escrito", out, "figuras:", nFigs());
});
function nFigs() { return "ok"; }
