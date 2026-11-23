/*
 * Banco de pruebas en simavr para la Entrega 2 (Bluetooth HC-05 + Arduino UNO).
 *
 * Carga el ELF del firmware en un ATmega328P a 16 MHz y le conecta:
 *   - Un modelo del modulo HC-05 en el UART0 (D0/D1): puente transparente a la
 *     velocidad configurada (8N1), con pin STATE en D5 (alto = enlazado). Si no
 *     hay enlace, los bytes se descartan en ambos sentidos, como en el modulo real.
 *   - Un "telefono" virtual que ejecuta un guion de pruebas (ordenes, rafagas,
 *     ecos, caida del enlace) y registra lo que envia y lo que recibe.
 *   - Un pulsador en D4 con rebotes mecanicos simulados.
 *   - Registro de los LED (D2, D3) y del tiempo que la CPU pasa dormida
 *     (referencia exacta para validar la medicion que hace el propio firmware).
 *
 * El enlace de radio Bluetooth no se simula (ningun simulador de Arduino lo
 * hace): se modela el HC-05 como un puente UART ideal, sin latencia de aire.
 *
 * Uso: tb_hc05 <firmware.elf> <dir_salida> [--ff] [--dur s] [--baud b]
 *              [--escenario completo|reposo|reposo_leds] [--sin-sondeo]
 *   --ff   avance rapido: no sincroniza con el reloj real mientras el AVR
 *          duerme (por defecto simavr 1.6 si lo hace).
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <simavr/sim_avr.h>
#include <simavr/sim_elf.h>
#include <simavr/sim_time.h>
#include <simavr/avr_uart.h>
#include <simavr/avr_ioport.h>
#include <simavr/avr_extint.h>

#define F_CPU 16000000ULL
#define US(c) ((double)(c) * 1e6 / F_CPU)
#define CYC_MS(ms) ((avr_cycle_count_t)((ms) * (F_CPU / 1000.0)))

static avr_t *avr;
static avr_irq_t *uart_in, *pin_boton, *pin_estado;
static avr_cycle_count_t cpb;            /* ciclos por byte en el enlace */
static int enlace = 0;
static FILE *f_tx, *f_ord, *f_rx, *f_pc, *f_pin, *f_cpu;

/* ------------------------------------------------------------------ */
/* Telefono -> HC-05 -> UNO                                             */
/* ------------------------------------------------------------------ */
#define QN 65536
static uint8_t q[QN];
static uint16_t q_line[QN];              /* id de linea de cada byte */
static unsigned qh = 0, qt = 0;
static int bomba_activa = 0;
static int lineas_tx = 0, lineas_perdidas = 0;
static uint32_t bytes_aire_perdidos = 0;

static double t_inicio_linea[20000], t_fin_linea[20000];

/* simavr 1.6 entrega los bytes recibidos algo por debajo de la tasa nominal
 * (~91 % a 9600 baudios); si se inyectan a ritmo nominal su FIFO interno de 64
 * bytes se desborda, algo que no ocurre en el ATmega328P real. Por eso el
 * modelo del HC-05 entrega cada byte cuando simavr ya entrego el anterior
 * (aviso XON) y respetando como minimo el tiempo de un byte; mientras tanto el
 * byte espera en el buffer del modulo. */
static int uart_vacio = 1;
static avr_cycle_count_t t_ultimo = 0;
static unsigned q_max = 0;
static void uart_xon(struct avr_irq_t *irq, uint32_t v, void *p) { if (v) uart_vacio = 1; }

static avr_cycle_count_t bomba(avr_t *a, avr_cycle_count_t when, void *p) {
	if (qh == qt) { bomba_activa = 0; return 0; }
	unsigned ocup = (qt + QN - qh) % QN; if (ocup > q_max) q_max = ocup;
	if (enlace && (!uart_vacio || when < t_ultimo + cpb)) return when + 64;   /* espera */
	uint8_t b = q[qh]; uint16_t id = q_line[qh]; qh = (qh + 1) % QN;
	if (!enlace) { bytes_aire_perdidos++; return when + cpb; }
	if (t_inicio_linea[id] < 0) t_inicio_linea[id] = US(when);
	uart_vacio = 0; t_ultimo = when;
	avr_raise_irq(uart_in, b);           /* el byte termina de llegar en when+cpb */
	t_fin_linea[id] = US(when + cpb);
	return when + cpb;
}

static void telefono_envia(const char *s, const char *fin) {
	char buf[256];
	snprintf(buf, sizeof buf, "%s%s", s, fin);
	int id = lineas_tx++;
	t_inicio_linea[id] = -1; t_fin_linea[id] = -1;
	fprintf(f_ord, "%d,%.1f,\"%s\",%s\n", id, US(avr->cycle), s, enlace ? "enlace" : "sin_enlace");
	if (!enlace) { lineas_perdidas++; return; }      /* sin conexion SPP no se puede enviar */
	for (char *c = buf; *c; c++) { q[qt] = *c; q_line[qt] = id; qt = (qt + 1) % QN; }
	if (!bomba_activa) { bomba_activa = 1; avr_cycle_timer_register(avr, 1, bomba, NULL); }
}

/* ------------------------------------------------------------------ */
/* UNO -> HC-05 -> telefono (y monitor serie del PC)                    */
/* ------------------------------------------------------------------ */
static char lin_rx[512]; static int n_rx = 0;
static uint32_t bytes_uno_tx = 0, bytes_rx_tel = 0;

static void uart_sale(struct avr_irq_t *irq, uint32_t v, void *p) {
	bytes_uno_tx++;
	if (enlace) bytes_rx_tel++;
	if (v == '\r') return;
	if (v == '\n' || n_rx >= (int)sizeof lin_rx - 1) {
		lin_rx[n_rx] = 0;
		double t = US(avr->cycle + cpb);   /* fin del bit de parada */
		fprintf(f_pc, "%.1f,%s\n", t, lin_rx);
		if (enlace) fprintf(f_rx, "%.1f,%s\n", t, lin_rx);
		n_rx = 0;
		return;
	}
	lin_rx[n_rx++] = (char)v;
}

static uint32_t n_xoff = 0;
static void uart_xoff(struct avr_irq_t *irq, uint32_t v, void *p) {
	if (v) { n_xoff++; fprintf(f_pin, "%.1f,UART_FIFO_LLENO,1\n", US(avr->cycle)); }
}

static void pin_cambia(struct avr_irq_t *irq, uint32_t v, void *p) {
	fprintf(f_pin, "%.1f,%s,%u\n", US(avr->cycle), (const char *)p, v);
}

/* ------------------------------------------------------------------ */
/* Guion de pruebas                                                     */
/* ------------------------------------------------------------------ */
enum { EV_LINEA, EV_ENLACE, EV_BOTON };
typedef struct { double ms; int tipo; int val; char txt[96]; char fin[3]; } evento_t;
static evento_t ev[30000]; static int n_ev = 0, i_ev = 0;

static void ev_linea(double ms, const char *s, const char *fin) {
	evento_t *e = &ev[n_ev++]; e->ms = ms; e->tipo = EV_LINEA;
	snprintf(e->txt, sizeof e->txt, "%s", s); snprintf(e->fin, sizeof e->fin, "%s", fin);
}
static void ev_simple(double ms, int tipo, int val) {
	evento_t *e = &ev[n_ev++]; e->ms = ms; e->tipo = tipo; e->val = val;
}
/* Pulsacion con rebotes: el contacto oscila antes de quedar estable. */
static void ev_rebote(double ms, int final) {
	static const double d[] = {0, 0.25, 0.7, 1.3, 2.1, 3.2};   /* ms */
	for (int i = 0; i < 6; i++) ev_simple(ms + d[i], EV_BOTON, (i % 2 == 0) ? final : !final);
	ev_simple(ms + 4.5, EV_BOTON, final);
}
static int cmp_ev(const void *a, const void *b) {
	double x = ((evento_t *)a)->ms, y = ((evento_t *)b)->ms;
	return (x > y) - (x < y);
}

static uint32_t semilla = 12345;
static double azar(void) { semilla = semilla * 1103515245u + 12345u; return ((semilla >> 8) & 0xFFFF) / 65536.0; }

static void guion_completo(double dur_ms) {
	/* 0-2 s: arranque sin enlace; una orden enviada sin enlace se pierde */
	ev_linea(1000, "V1", "\n");
	ev_simple(2000, EV_ENLACE, 1);
	/* A) 3-10 s: prueba funcional de cada orden y de los finales de linea */
	const char *fa[] = {"?", "V1", "R1", "S", "V0", "r0", "s", "P", "XYZ", "V1", "E hola mundo",
	                    "E esta linea tiene mas de cuarenta y ocho caracteres!!", "R1", "P"};
	const char *fin[] = {"\n", "\n", "\r\n", "\n", "\r", "\n", "\r\n", "\n", "\n", "\r\n", "\n", "\n", "\n", "\n"};
	for (int i = 0; i < 14; i++) ev_linea(3000 + i * 500, fa[i], fin[i]);
	/* B) 10.5-30 s: latencia con ordenes a intervalos aleatorios de 40 a 80 ms */
	const char *fb[] = {"P", "V0", "V1", "R0", "R1"};
	int k = 0;
	for (double t = 10500; t < 30000; t += 40 + 40 * azar()) ev_linea(t, fb[k++ % 5], "\n");
	/* C) 30-38 s: eco a la maxima velocidad del enlace (lineas de 32 bytes, sin pausas) */
	{
		double t_linea = 32 * 10.0 * 1000.0 / 9600;     /* ms por linea a 9600 baudios */
		int n = 0;
		for (double t = 30000; t < 38000; t += t_linea) {
			char s[64]; snprintf(s, sizeof s, "E %05d-ABCDEFGHIJKLMNOPQRSTUVW", n++);
			ev_linea(t, s, "\n");
		}
	}
	/* D) 39-43 s: inundacion de consultas "S" (respuesta mucho mas larga) */
	for (double t = 39000; t < 43000; t += 2 * 10.0 * 1000.0 / 9600) ev_linea(t, "S", "\n");
	/* E) 46-52 s: pulsador con rebotes y un pico de 5 ms que debe ignorarse */
	for (int i = 0; i < 5; i++) { ev_rebote(46000 + i * 1000, 0); ev_rebote(46400 + i * 1000, 1); }
	ev_simple(51500, EV_BOTON, 0); ev_simple(51505, EV_BOTON, 1);
	/* F) 53-58 s: caida del enlace, orden perdida y reconexion */
	ev_linea(52800, "V1", "\n");
	ev_simple(53000, EV_ENLACE, 0);
	ev_linea(54000, "R1", "\n");
	ev_simple(55500, EV_ENLACE, 1);
	ev_linea(56000, "S", "\n");
	ev_linea(56500, "V1", "\n");
	ev_linea(57000, "P", "\n");
	(void)dur_ms;
}

/* simavr re-aplica el pull-up interno de un pin de entrada cada vez que el
 * firmware escribe en PORTD (por ejemplo, al encender un LED), lo que soltaria
 * el pulsador por error. Declarar D4 y D5 como entradas con nivel externo hace
 * que ese nivel tenga prioridad, como ocurre con un pulsador real a GND. */
static int nivel_boton = 1;
static void fijar_externos(void) {
	avr_ioport_external_t e = { .name = 'D', .mask = (1 << 4) | (1 << 5),
	                            .value = (nivel_boton << 4) | (enlace << 5) };
	avr_ioctl(avr, AVR_IOCTL_IOPORT_SET_EXTERNAL('D'), &e);
}

/* Escenarios cortos para medir el costo de simular en el anfitrion:
 * reposo: solo se establece el enlace (LED apagados todo el tiempo);
 * reposo_leds: igual, pero a 1 s se encienden los dos LED (D2/D3 en alto). */
static void guion_reposo(int leds) {
	ev_simple(500, EV_ENLACE, 1);
	if (leds) { ev_linea(1000, "V1", "\n"); ev_linea(1100, "R1", "\n"); }
}

static avr_cycle_count_t despachar(avr_t *a, avr_cycle_count_t when, void *p) {
	while (i_ev < n_ev && CYC_MS(ev[i_ev].ms) <= when) {
		evento_t *e = &ev[i_ev++];
		switch (e->tipo) {
		case EV_LINEA: telefono_envia(e->txt, e->fin); break;
		case EV_ENLACE:
			enlace = e->val; fijar_externos(); avr_raise_irq(pin_estado, e->val);
			fprintf(f_pin, "%.1f,BT_STATE,%d\n", US(when), e->val); break;
		case EV_BOTON:
			nivel_boton = e->val; fijar_externos(); avr_raise_irq(pin_boton, e->val);
			fprintf(f_pin, "%.1f,BOTON,%d\n", US(when), e->val); break;
		}
	}
	if (i_ev >= n_ev) return 0;
	avr_cycle_count_t sig = CYC_MS(ev[i_ev].ms);
	return sig > when ? sig : when + 1;
}

static void dormir_nada(avr_t *a, avr_cycle_count_t how_long) { (void)a; (void)how_long; }

static double reloj(void) {
	struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts);
	return ts.tv_sec + ts.tv_nsec * 1e-9;
}

int main(int argc, char **argv) {
	if (argc < 3) { fprintf(stderr, "uso: %s fw.elf dir [--ff] [--dur s] [--baud b]\n", argv[0]); return 1; }
	const char *dir = argv[2];
	int ff = 0; double dur = 60; int baud = 9600; int sin_sondeo = 0; const char *esc = "completo";
	for (int i = 3; i < argc; i++) {
		if (!strcmp(argv[i], "--ff")) ff = 1;
		else if (!strcmp(argv[i], "--dur")) dur = atof(argv[++i]);
		else if (!strcmp(argv[i], "--baud")) baud = atoi(argv[++i]);
		else if (!strcmp(argv[i], "--escenario")) esc = argv[++i];
		else if (!strcmp(argv[i], "--sin-sondeo")) sin_sondeo = 1;
	}

	elf_firmware_t fw; memset(&fw, 0, sizeof fw);
	if (elf_read_firmware(argv[1], &fw)) { fprintf(stderr, "no se pudo leer %s\n", argv[1]); return 1; }
	avr = avr_make_mcu_by_name("atmega328p");
	avr_init(avr);
	avr->frequency = F_CPU;
	avr_load_firmware(avr, &fw);
	avr->log = LOG_ERROR;
	if (ff) avr->sleep = dormir_nada;

	cpb = (avr_cycle_count_t)(F_CPU * 10 / baud);

	char ruta[512];
#define ABRE(f, n, cab) snprintf(ruta, sizeof ruta, "%s/%s", dir, n); f = fopen(ruta, "w"); fprintf(f, cab)
	ABRE(f_tx,  "telefono_tx.csv", "id,t_inicio_us,t_fin_us\n");
	ABRE(f_ord, "telefono_ordenes.csv", "id,t_orden_us,texto,estado\n");
	ABRE(f_rx,  "telefono_rx.csv", "t_us,linea\n");
	ABRE(f_pc,  "monitor_serie.csv", "t_us,linea\n");
	ABRE(f_pin, "pines.csv", "t_us,pin,valor\n");
	ABRE(f_cpu, "cpu_referencia.csv", "t_s,ciclos_activos,ciclos_dormido,cpu_pct,t_real_s\n");

	/* UART0: sin eco a la consola y sin pausas al sondear el registro de estado */
	uint32_t flags = 0;
	avr_ioctl(avr, AVR_IOCTL_UART_SET_FLAGS('0'), &flags);
	uart_in = avr_io_getirq(avr, AVR_IOCTL_UART_GETIRQ('0'), UART_IRQ_INPUT);
	avr_irq_register_notify(avr_io_getirq(avr, AVR_IOCTL_UART_GETIRQ('0'), UART_IRQ_OUTPUT), uart_sale, NULL);

	avr_irq_register_notify(avr_io_getirq(avr, AVR_IOCTL_UART_GETIRQ('0'), UART_IRQ_OUT_XOFF), uart_xoff, NULL);
	avr_irq_register_notify(avr_io_getirq(avr, AVR_IOCTL_UART_GETIRQ('0'), UART_IRQ_OUT_XON), uart_xon, NULL);
	avr_irq_register_notify(avr_io_getirq(avr, AVR_IOCTL_IOPORT_GETIRQ('D'), 2), pin_cambia, "LED_VERDE");
	avr_irq_register_notify(avr_io_getirq(avr, AVR_IOCTL_IOPORT_GETIRQ('D'), 3), pin_cambia, "LED_ROJO");
	pin_boton  = avr_io_getirq(avr, AVR_IOCTL_IOPORT_GETIRQ('D'), 4);
	pin_estado = avr_io_getirq(avr, AVR_IOCTL_IOPORT_GETIRQ('D'), 5);
	fijar_externos();
	avr_raise_irq(pin_boton, 1);         /* pulsador suelto (pull-up) */
	avr_raise_irq(pin_estado, 0);        /* sin enlace al arrancar */

	/* simavr consulta INT0/INT1 (D2/D3) en cada ciclo mientras estan en bajo
	 * si el modo es "nivel bajo", aunque la interrupcion este deshabilitada.
	 * --sin-sondeo desactiva esa consulta (avr_extint_set_strict_lvl_trig). */
	if (sin_sondeo) { avr_extint_set_strict_lvl_trig(avr, 0, 0); avr_extint_set_strict_lvl_trig(avr, 1, 0); }
	if (!strcmp(esc, "reposo")) guion_reposo(0);
	else if (!strcmp(esc, "reposo_leds")) guion_reposo(1);
	else guion_completo(dur * 1000);
	qsort(ev, n_ev, sizeof ev[0], cmp_ev);
	avr_cycle_timer_register(avr, CYC_MS(ev[0].ms) + 1, despachar, NULL);

	avr_cycle_count_t fin = (avr_cycle_count_t)(dur * F_CPU);
	avr_cycle_count_t dormido = 0, dormido_ant = 0, ciclo_ant = 0, sig_ventana = F_CPU;
	double t0 = reloj();
	int estado = cpu_Running;
	while (avr->cycle < fin && estado != cpu_Done && estado != cpu_Crashed) {
		avr_cycle_count_t c0 = avr->cycle;
		int antes = avr->state;
		estado = avr_run(avr);
		if (antes == cpu_Sleeping) dormido += avr->cycle - c0;
		if (avr->cycle >= sig_ventana) {
			avr_cycle_count_t tot = avr->cycle - ciclo_ant, dor = dormido - dormido_ant;
			fprintf(f_cpu, "%.3f,%llu,%llu,%.2f,%.3f\n", avr->cycle / (double)F_CPU,
			        (unsigned long long)(tot - dor), (unsigned long long)dor,
			        100.0 * (tot - dor) / tot, reloj() - t0);
			ciclo_ant = avr->cycle; dormido_ant = dormido; sig_ventana += F_CPU;
		}
	}
	double t_real = reloj() - t0;
	for (int i = 0; i < lineas_tx; i++)
		if (t_inicio_linea[i] >= 0) fprintf(f_tx, "%d,%.1f,%.1f\n", i, t_inicio_linea[i], t_fin_linea[i]);

	snprintf(ruta, sizeof ruta, "%s/resumen.json", dir);
	FILE *fr = fopen(ruta, "w");
	fprintf(fr, "{\n \"firmware\": \"%s\",\n \"modo_simavr\": \"%s\",\n \"baudios\": %d,\n"
	        " \"t_simulado_s\": %.3f,\n \"t_real_s\": %.3f,\n \"factor_tiempo_real\": %.3f,\n"
	        " \"cpu_activa_pct_global\": %.3f,\n \"lineas_enviadas_telefono\": %d,\n"
	        " \"lineas_no_enviadas_sin_enlace\": %d,\n \"bytes_uno_tx\": %u,\n \"bytes_recibidos_telefono\": %u,\n"
	        " \"max_bytes_en_buffer_hc05\": %u,\n \"eventos_fifo_simavr_lleno\": %u,\n \"escenario\": \"%s\",\n \"sondeo_int0_int1\": %d,\n \"estado_final_cpu\": %d\n}\n",
	        argv[1], ff ? "avance_rapido" : "sincronizado_tiempo_real", baud,
	        avr->cycle / (double)F_CPU, t_real, (avr->cycle / (double)F_CPU) / t_real,
	        100.0 * (avr->cycle - dormido) / avr->cycle, lineas_tx, lineas_perdidas,
	        bytes_uno_tx, bytes_rx_tel, q_max, n_xoff, esc, !sin_sondeo, estado);
	fclose(fr);
	fclose(f_tx); fclose(f_ord); fclose(f_rx); fclose(f_pc); fclose(f_pin); fclose(f_cpu);
	printf("simulados %.1f s en %.2f s reales (x%.2f), CPU activa %.2f %%\n",
	       avr->cycle / (double)F_CPU, t_real, (avr->cycle / (double)F_CPU) / t_real,
	       100.0 * (avr->cycle - dormido) / avr->cycle);
	return 0;
}
