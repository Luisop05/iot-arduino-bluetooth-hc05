#!/usr/bin/env python3
"""Genera las figuras del articulo a partir de datos/ y datos/resultados.json."""
import csv, glob, json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(RAIZ, "datos")
FIG = os.path.join(RAIZ, "figuras")
os.makedirs(FIG, exist_ok=True)

# Paleta de referencia (orden categorico fijo) y tintas de texto
AZUL, NARANJA, AQUA, AMARILLO = "#2a78d6", "#eb6834", "#1baf7a", "#eda100"
VERDE_LED, ROJO_LED, VIOLETA = "#008300", "#e34948", "#6250d6"
TINTA, TINTA2, REJILLA = "#0b0b0b", "#52514e", "#e4e3df"

plt.rcParams.update({
    "font.family": "DejaVu Serif", "font.size": 8, "axes.titlesize": 8.5,
    "axes.labelsize": 8, "xtick.labelsize": 7, "ytick.labelsize": 7, "legend.fontsize": 7,
    "axes.edgecolor": TINTA2, "axes.labelcolor": TINTA, "xtick.color": TINTA2, "ytick.color": TINTA2,
    "axes.grid": True, "grid.color": REJILLA, "grid.linewidth": 0.6, "axes.axisbelow": True,
    "axes.spines.top": False, "axes.spines.right": False, "lines.linewidth": 1.4,
    "legend.frameon": False, "savefig.dpi": 300, "savefig.bbox": "tight",
})
ANCHO = 3.5  # ancho de una columna IEEE en pulgadas

FASES = [(3, 10, "A"), (10.5, 30, "B"), (30, 38, "C"), (39, 43, "D"), (46, 52, "E"), (53, 57.5, "F")]


def rep1(conf):
    return os.path.join(DATOS, conf, "rep1")


def pines(conf):
    out = {}
    with open(os.path.join(rep1(conf), "pines.csv")) as f:
        for r in csv.DictReader(f):
            out.setdefault(r["pin"], []).append((float(r["t_us"]) / 1e6, int(r["valor"])))
    return out


def escalon(ax, serie, y0, color, t_fin=60, alto=0.7):
    t = [0]; v = [serie[0][1] if serie and serie[0][0] < 0.001 else 0]
    for ti, vi in serie:
        t += [ti, ti]; v += [v[-1], vi]
    t.append(t_fin); v.append(v[-1])
    ax.fill_between(t, y0, y0 + alto * np.array(v), step=None, color=color, alpha=0.85, linewidth=0)


def sombrear(ax, texto=True, y=1.0):
    for a, b, n in FASES:
        ax.axvspan(a, b, color="#f1f0ec", zorder=0, linewidth=0)
        if texto:
            ax.text((a + b) / 2, y, n, transform=ax.get_xaxis_transform(), ha="center", va="bottom",
                    fontsize=7, color=TINTA2)


def fig_linea_tiempo(res):
    conf = "v2_sleep_avance_rapido"
    p = pines(conf)
    tel = res["configuraciones"][conf]["telemetria"]
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(ANCHO, 3.0), sharex=True,
                                 gridspec_kw={"height_ratios": [1.3, 1], "hspace": 0.12})
    sombrear(a1)
    filas = [("LED verde (D2)", "LED_VERDE", VERDE_LED), ("LED rojo (D3)", "LED_ROJO", ROJO_LED),
             ("STATE HC-05 (D5)", "BT_STATE", AZUL), ("Pulsador (D4, 0 = pulsado)", "BOTON", VIOLETA)]
    for i, (et, pin, col) in enumerate(filas):
        y0 = 3 - i
        escalon(a1, p.get(pin, []), y0, col)
        a1.text(0.4, y0 + 0.82, et, ha="left", va="center", fontsize=6, color=TINTA)
    a1.set_yticks([]); a1.set_ylim(-0.1, 4.15); a1.grid(False)
    a1.spines["left"].set_visible(False)
    # tasa media entre lineas de telemetria consecutivas (algunas se descartan en saturacion)
    t = [x["t_ms"] / 1000 for x in tel][1:]
    d = [(b["rx"] - a["rx"]) / ((b["t_ms"] - a["t_ms"]) / 1000) for a, b in zip(tel, tel[1:])]
    sombrear(a2, texto=False)
    a2.plot(t, d, color=AZUL, marker="o", markersize=2.2, label="Bytes recibidos por el UNO")
    a2.axhline(960, color=TINTA2, linewidth=0.8, linestyle="--")
    a2.text(0.5, 990, "máximo a 9600 baudios (960 B/s)", fontsize=6, color=TINTA2)
    a2.set_ylabel("B/s"); a2.set_xlabel("Tiempo simulado (s)"); a2.set_ylim(0, 1150); a2.set_xlim(0, 60)
    a2.legend(loc="upper left", bbox_to_anchor=(0.0, 0.85), fontsize=6)
    fig.savefig(os.path.join(FIG, "fig_linea_tiempo.png")); plt.close(fig)


def fig_latencias(res):
    B = res["configuraciones"]["v2_sleep_avance_rapido"]["fase_B"]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(ANCHO, 1.6), gridspec_kw={"wspace": 0.45})
    rtt = np.array(B["muestras_rtt"])
    a1.hist(rtt, bins=np.arange(10, 42, 1), color=AZUL, edgecolor="white", linewidth=0.5)
    a1.set_yscale("log"); a1.set_xlabel("Ida y vuelta (ms)"); a1.set_ylabel("Órdenes")
    a1.set_title("(a)", loc="left")
    led = np.array(B["muestras_led"]) * 1000
    a2.hist(led, bins=12, color=AQUA, edgecolor="white", linewidth=0.5)
    a2.set_xlabel("Último byte→LED (µs)"); a2.set_title("(b)", loc="left")
    fig.savefig(os.path.join(FIG, "fig_latencias.png")); plt.close(fig)


def fig_cpu(res):
    c = res["configuraciones"]
    s = np.array(c["v2_sleep_avance_rapido"]["cpu"]["serie"])
    b = np.array(c["v2_busy"]["cpu"]["serie"])
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(ANCHO, 2.9), sharex=True, gridspec_kw={"hspace": 0.18})
    sombrear(a1)
    a1.plot(b[:, 0], b[:, 2], color=NARANJA, label="Sin sleep (referencia simavr)")
    a1.plot(s[:, 0], s[:, 2], color=AZUL, label="Con sleep (referencia simavr)")
    a1.plot(s[:, 0], s[:, 1], color=AQUA, linestyle="none", marker="o", markersize=2.5,
            label="Con sleep (medido por el firmware)")
    a1.set_yscale("log"); a1.set_ylim(1, 200); a1.set_ylabel("CPU activa (%)")
    a1.legend(loc="center left", bbox_to_anchor=(0, 0.62), fontsize=6.3)
    sombrear(a2, texto=False)
    a2.plot(b[:, 0], b[:, 3] / 1000, color=NARANJA, label="Sin sleep")
    a2.plot(s[:, 0], s[:, 3] / 1000, color=AZUL, label="Con sleep")
    a2.set_yscale("log"); a2.set_ylabel("loop()/s (miles)"); a2.set_xlabel("Tiempo simulado (s)")
    a2.legend(loc="center left", bbox_to_anchor=(0, 0.45)); a2.set_xlim(0, 60)
    fig.savefig(os.path.join(FIG, "fig_cpu.png")); plt.close(fig)


def fig_anfitrion(res):
    c = res["configuraciones"]
    def costo(k):
        h = c[k]["anfitrion"]
        if "cpu_s_por_s_simulado" in h:
            return h["cpu_s_por_s_simulado"]["media"], h["cpu_s_por_s_simulado"]["desv"]
        tsim = c[k]["resumen_banco"]["t_simulado_s"]
        return h["cpu_proceso"]["media"] / 100 * h["t_real"]["media"] / tsim, h["cpu_proceso"]["desv"] / 100 * h["t_real"]["media"] / tsim
    filas = [("v2_busy", "Guion completo, sin sleep", NARANJA),
             ("v2_sleep_avance_rapido", "Guion completo, con sleep", AZUL),
             ("v2_sleep_tiempo_real", "Ídem, sincronizado al reloj real", AZUL),
             ("reposo_leds_apagados", "Reposo, LED apagados", AQUA),
             ("reposo_leds_encendidos", "Reposo, LED encendidos", AQUA),
             ("reposo_sin_sondeo", "Reposo, sin sondeo INT0/INT1", AQUA)]
    fig, ax = plt.subplots(figsize=(ANCHO, 1.9))
    for i, (k, et, col) in enumerate(filas):
        m, d = costo(k)
        ax.barh(i, m, xerr=d, color=col, height=0.62, error_kw={"elinewidth": 0.8, "ecolor": TINTA2})
        ax.text(m * 1.25 + d, i, num(m), va="center", fontsize=6.5, color=TINTA)
    ax.set_yticks(range(len(filas))); ax.set_yticklabels([f[1] for f in filas]); ax.invert_yaxis()
    ax.set_xscale("log"); ax.set_xlim(0.01, 3)
    ax.set_xlabel("CPU del anfitrión por segundo simulado (s)")
    ax.axhline(2.5, color=TINTA2, linewidth=0.6)
    fig.savefig(os.path.join(FIG, "fig_anfitrion.png")); plt.close(fig)


def num(x):
    return f"{x:.3f}".replace(".", ",")


def fig_v1_v2(res):
    c = res["configuraciones"]
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(ANCHO, 2.5), sharex=True, gridspec_kw={"hspace": 0.18})
    for k, et, col in [("v1_bloqueante", "v1: Serial.print bloqueante", NARANJA),
                       ("v2_sleep_avance_rapido", "v2: cola de salida no bloqueante", AZUL)]:
        tel = [x for x in c[k]["telemetria"] if 25e6 < x["t_us"] < 48e6]
        t = [x["t_us"] / 1e6 for x in tel]
        a1.plot(t, [x["loops"] for x in tel], color=col, marker="o", markersize=2.5, label=et)
        a2.plot(t, [x["err"] for x in tel], color=col, marker="o", markersize=2.5, label=et)
    for ax in (a1, a2):
        for a, b, n in FASES[2:4]:
            ax.axvspan(a, b, color="#f1f0ec", zorder=0, linewidth=0)
    a1.text(34, 1.02, "C: eco", transform=a1.get_xaxis_transform(), ha="center", fontsize=7, color=TINTA2)
    a1.text(41, 1.02, "D: inundación", transform=a1.get_xaxis_transform(), ha="center", fontsize=7, color=TINTA2)
    a1.set_yscale("log"); a1.set_ylabel("loop()/s"); a1.legend(loc="lower left", fontsize=6.3)
    a2.set_ylabel("Órdenes erróneas\n(acumulado)"); a2.set_xlabel("Tiempo simulado (s)")
    fig.savefig(os.path.join(FIG, "fig_v1_v2.png")); plt.close(fig)


def fig_rebote():
    p = pines("v2_sleep_avance_rapido")
    bot = [(t, v) for t, v in p["BOTON"] if 45.99 < t < 46.1]
    roj = [(t, v) for t, v in p["LED_ROJO"] if 45.99 < t < 46.1]
    fig, ax = plt.subplots(figsize=(ANCHO, 1.35))
    def traza(serie, y0, col, v_ini):
        t = [45.99]; v = [v_ini]
        for ti, vi in serie:
            t += [ti, ti]; v += [v[-1], vi]
        t.append(46.1); v.append(v[-1])
        ax.plot((np.array(t) - 46) * 1000, y0 + 0.7 * np.array(v), color=col, linewidth=1.2)
    traza(bot, 1.2, VIOLETA, 1)
    traza(roj, 0, ROJO_LED, roj[0][1] ^ 1 if roj else 0)
    ax.axvspan(4.5, 34.5, color="#f1f0ec", zorder=0)
    ax.text(19.5, 2.12, "30 ms estable (antirrebote)", ha="center", fontsize=6.5, color=TINTA2)
    ax.text(-9, 1.55, "D4", ha="right", va="center", fontsize=7); ax.text(-9, 0.35, "D3", ha="right", va="center", fontsize=7)
    ax.set_yticks([]); ax.set_ylim(-0.1, 2.35); ax.set_xlim(-10, 100)
    ax.set_xlabel("Tiempo desde el primer flanco (ms)"); ax.spines["left"].set_visible(False); ax.grid(False)
    fig.savefig(os.path.join(FIG, "fig_rebote.png")); plt.close(fig)


def main():
    with open(os.path.join(DATOS, "resultados.json")) as f:
        res = json.load(f)
    fig_linea_tiempo(res); fig_latencias(res); fig_cpu(res); fig_anfitrion(res); fig_v1_v2(res); fig_rebote()
    print("figuras listas en", FIG)


if __name__ == "__main__":
    main()
