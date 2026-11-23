#!/usr/bin/env python3
"""
Analisis de los registros del banco de pruebas (Entrega 2).

Lee datos/<config>/rep<k>/ y produce datos/resultados.json con:
  - prueba funcional (fase A), latencias (fase B), eco a maxima velocidad
    (fase C), inundacion de consultas (fase D), pulsador (fase E) y caida del
    enlace (fase F), a partir de la primera repeticion de cada configuracion;
  - uso de CPU del ATmega328P: medido por el firmware vs. referencia de simavr;
  - indicadores del anfitrion (media +- desviacion entre repeticiones);
  - comprobacion de que los registros del firmware son identicos entre repeticiones.
Uso: python3 analisis.py [dir_datos]
"""
import csv, glob, hashlib, json, os, re, statistics as st, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, "datos")


def leer_csv(ruta):
    with open(ruta, newline="") as f:
        return list(csv.DictReader(f))


def cargar(dirrep):
    ordenes = leer_csv(os.path.join(dirrep, "telefono_ordenes.csv"))
    tx = {r["id"]: r for r in leer_csv(os.path.join(dirrep, "telefono_tx.csv"))}
    rx = []
    with open(os.path.join(dirrep, "telefono_rx.csv")) as f:
        next(f)
        for ln in f:
            t, _, txt = ln.rstrip("\n").partition(",")
            rx.append((float(t), txt))
    pc = []
    with open(os.path.join(dirrep, "monitor_serie.csv")) as f:
        next(f)
        for ln in f:
            t, _, txt = ln.rstrip("\n").partition(",")
            pc.append((float(t), txt))
    pines = [(float(r["t_us"]), r["pin"], int(r["valor"])) for r in leer_csv(os.path.join(dirrep, "pines.csv"))]
    cpu = leer_csv(os.path.join(dirrep, "cpu_referencia.csv"))
    with open(os.path.join(dirrep, "resumen.json")) as f:
        res = json.load(f)
    for o in ordenes:
        o["t_orden"] = float(o["t_orden_us"])
        t = tx.get(o["id"])
        o["t_ini"] = float(t["t_inicio_us"]) if t else None
        o["t_fin"] = float(t["t_fin_us"]) if t else None
    return ordenes, rx, pc, pines, cpu, res


def respuesta_esperada(txt, n_pong):
    if len(txt) > 48:
        return "ERR LARGO"
    c = txt.split(" ")[0].upper()
    if c in ("V1", "V0", "R1", "R0"):
        return "OK " + c
    if c == "P":
        return "PONG %d" % n_pong
    if c == "S":
        return "ST "
    if c == "?":
        return "V1 V0 R1 R0 S P E<txt>"
    if c == "E" and " " in txt:
        return "E " + txt.split(" ", 1)[1]
    return None


def telemetria(pc):
    filas = []
    for t, s in pc:
        if s.startswith("#T,"):
            p = s.split(",")
            if len(p) == 10:          # firmware v1: sin columna resp_descartadas
                p = p[:7] + ["0"] + p[7:]
            if len(p) != 11:
                continue
            filas.append(dict(t_us=t, t_ms=int(p[1]), cpu=int(p[2]) / 10, loops=int(p[3]), rx=int(p[4]),
                              ok=int(p[5]), err=int(p[6]), desc=int(p[7]), v=int(p[8]), r=int(p[9]), bt=int(p[10])))
    return filas


def en_rango(t0, t1, lista):
    return [x for x in lista if t0 <= x[0] < t1]


def percentil(xs, p):
    xs = sorted(xs)
    k = (len(xs) - 1) * p / 100
    f = int(k)
    return xs[f] + (xs[min(f + 1, len(xs) - 1)] - xs[f]) * (k - f)


def resumen_lista(xs):
    return dict(n=len(xs), media=st.mean(xs), mediana=st.median(xs), min=min(xs), max=max(xs),
                p95=percentil(xs, 95), desv=st.pstdev(xs))


def analizar_funcional(ordenes, rx, pines):
    """Empareja cada orden con la primera respuesta posterior y con el cambio de LED."""
    n_pong = 0
    filas = []
    leds = [(t, p, v) for t, p, v in pines if p.startswith("LED")]
    for o in ordenes:
        if o["t_ini"] is None:
            filas.append(dict(id=int(o["id"]), orden=o["texto"], t_s=o["t_orden"] / 1e6, enviada=False))
            continue
        txt = o["texto"]
        if txt.upper() == "P":
            n_pong += 1
        esp = respuesta_esperada(txt, n_pong)
        t_fin = o["t_fin"]
        # primera linea recibida tras el fin de la orden que no sea telemetria ni evento
        resp = next(((t, s) for t, s in rx if t > t_fin and not s.startswith("#T") and not s.startswith("EV ")), None)
        # cambio de LED tras la orden
        t_led = None
        c = txt.upper()
        if c in ("V1", "V0", "R1", "R0"):
            pin = "LED_VERDE" if c[0] == "V" else "LED_ROJO"
            ch = next(((t, v) for t, p, v in leds if p == pin and t > t_fin and t < t_fin + 50000), None)
            t_led = ch[0] if ch else None
        ok = None
        if resp:
            if esp is None:
                ok = resp[1].startswith("ERR")
            elif esp == "ST ":
                ok = resp[1].startswith("ST ")
            else:
                ok = resp[1] == esp
        filas.append(dict(id=int(o["id"]), orden=txt, t_s=o["t_orden"] / 1e6, enviada=True,
                          t_ini=o["t_ini"], t_fin=t_fin, respuesta=resp[1] if resp else None,
                          t_resp=resp[0] if resp else None, correcta=ok, t_led=t_led))
    return filas


def analizar_rep(dirrep):
    ordenes, rx, pc, pines, cpu, res = cargar(dirrep)
    fun = analizar_funcional(ordenes, rx, pines)
    tel = telemetria(pc)
    out = {"resumen_banco": res}

    # Fase A: 3-10 s
    A = [f for f in fun if 3 <= f["t_s"] < 10]
    out["fase_A"] = [dict(orden=f["orden"], respuesta=f.get("respuesta"), correcta=f.get("correcta"),
                          rtt_ms=(f["t_resp"] - f["t_ini"]) / 1000 if f.get("t_resp") else None) for f in A]

    # Fase B: 10.5-30 s
    B = [f for f in fun if 10.5 <= f["t_s"] < 30 and f["enviada"]]
    rtt = [(f["t_resp"] - f["t_ini"]) / 1000 for f in B if f["correcta"]]
    proc_led = [(f["t_led"] - f["t_fin"]) / 1000 for f in B if f.get("t_led")]
    total_led = [(f["t_led"] - f["t_ini"]) / 1000 for f in B if f.get("t_led")]
    resp_tras_fin = [(f["t_resp"] - f["t_fin"]) / 1000 for f in B if f["correcta"]]
    out["fase_B"] = dict(ordenes=len(B), correctas=sum(1 for f in B if f["correcta"]),
                         rtt_ms=resumen_lista(rtt), proc_led_ms=resumen_lista(proc_led),
                         orden_a_led_ms=resumen_lista(total_led), fin_orden_a_fin_resp_ms=resumen_lista(resp_tras_fin),
                         muestras_rtt=rtt, muestras_led=proc_led)

    # Fase C: 30-38 s (eco)
    C = [f for f in fun if 30 <= f["t_s"] < 38]
    env = {f["orden"] for f in C}
    rec = [s for t, s in rx if s.startswith("E ") and 30e6 <= t < 40e6]
    intactas = [s for s in rec if s in env]
    t_ini = min(f["t_ini"] for f in C); t_fin = max(f["t_fin"] for f in C)
    bytes_env = sum(len(f["orden"]) + 1 for f in C)
    tel_c = [x for x in tel if 31e6 <= x["t_us"] < 39e6]
    out["fase_C"] = dict(lineas_enviadas=len(C), ecos_recibidos=len(rec), ecos_intactos=len(intactas),
                         ecos_corruptos=len(rec) - len(intactas),
                         tasa_entrada_Bps=bytes_env / ((t_fin - t_ini) / 1e6),
                         duracion_s=(t_fin - t_ini) / 1e6,
                         cpu_pct_medio=st.mean(x["cpu"] for x in tel_c) if tel_c else None,
                         loops_medio=st.mean(x["loops"] for x in tel_c) if tel_c else None)

    # Fase D: 39-43 s (inundacion "S")
    D = [f for f in fun if 39 <= f["t_s"] < 43]
    def tel_en(t):
        return min(tel, key=lambda x: abs(x["t_us"] - t))
    a, b = tel_en(38.9e6), tel_en(45.5e6)
    st_rec = [s for t, s in rx if s.startswith("ST ") and 39e6 <= t < 46e6]
    out["fase_D"] = dict(consultas_enviadas=len(D), procesadas=b["ok"] - a["ok"],
                         respuestas_recibidas=len(st_rec), respuestas_descartadas=b["desc"] - a["desc"],
                         errores=b["err"] - a["err"],
                         cpu_pct_max=max(x["cpu"] for x in tel if 39e6 <= x["t_us"] < 45e6))

    # Fase E: pulsador
    bot = [(t, v) for t, p, v in pines if p == "BOTON"]
    ev = [(t, s) for t, s in pc if s.startswith("EV BTN")]
    rojo = [(t, v) for t, p, v in pines if p == "LED_ROJO" and 45e6 < t < 52e6]
    presiones = [46e6 + i * 1e6 for i in range(5)]
    lat_led = []
    for tp in presiones:
        ch = next((t for t, v in rojo if t > tp), None)
        if ch:
            lat_led.append((ch - tp) / 1000)
    out["fase_E"] = dict(flancos_inyectados=sum(1 for t, v in bot if 45e6 < t < 52e6),
                         pulsaciones_reales=5, pico_5ms=1,
                         eventos_pulsar=sum(1 for t, s in ev if s.endswith("1")),
                         eventos_soltar=sum(1 for t, s in ev if s.endswith("0")),
                         conmutaciones_led_rojo=len(rojo),
                         primer_flanco_a_led_ms=resumen_lista(lat_led))

    # Fase F: enlace
    F = [f for f in fun if 52.5 <= f["t_s"] < 58]
    evbt = [(t / 1e6, s) for t, s in pc if s.startswith("EV BT ")]
    leds_off = [(t / 1e6, p, v) for t, p, v in pines if p.startswith("LED") and 53e6 <= t < 53.2e6]
    out["fase_F"] = dict(ordenes=[dict(orden=f["orden"], t_s=f["t_s"], enviada=f["enviada"], respuesta=f.get("respuesta"))
                                  for f in F],
                         eventos_enlace=evbt, leds_apagados=leds_off,
                         orden_sin_enlace_1s=[dict(orden=f["orden"], enviada=f["enviada"]) for f in fun if f["t_s"] < 2])

    # CPU del microcontrolador
    ref = [(float(r["t_s"]), float(r["cpu_pct"])) for r in cpu]
    pares = []
    for x in tel:
        if x["t_ms"] < 2000:
            continue
        # ventana de referencia que mejor coincide con la ventana del firmware (1 s que termina en t_ms)
        r = min(ref, key=lambda y: abs(y[0] * 1000 - x["t_ms"]))
        pares.append((x["t_ms"] / 1000, x["cpu"], r[1], x["loops"]))
    reposo = [p for p in pares if 2 < p[0] <= 10 or 45.5 < p[0] <= 46 or p[0] > 58]
    out["cpu"] = dict(serie=pares,
                      firmware_global_pct=st.mean(p[1] for p in pares),
                      referencia_global_pct=res["cpu_activa_pct_global"],
                      error_medio_pp=st.mean(p[2] - p[1] for p in pares),
                      reposo_firmware_pct=st.mean(p[1] for p in reposo),
                      reposo_referencia_pct=st.mean(p[2] for p in reposo),
                      loops_reposo=st.mean(p[3] for p in reposo))
    out["telemetria"] = tel
    return out


def huella(dirrep):
    h = hashlib.sha256()
    for n in ("monitor_serie.csv", "telefono_rx.csv", "pines.csv"):
        with open(os.path.join(dirrep, n), "rb") as f:
            h.update(f.read())
    return h.hexdigest()[:16]


def host(dirrep):
    filas = leer_csv(os.path.join(dirrep, "host.csv"))
    sim = [r for r in filas if r["fase"] == "simulacion" and r["cpu_proceso_pct"] != ""]
    rep = [r for r in filas if r["fase"] != "simulacion"]
    with open(os.path.join(dirrep, "resumen.json")) as f:
        res = json.load(f)
    extra = {}
    rp = os.path.join(dirrep, "cpu_proceso.json")
    if os.path.exists(rp):
        with open(rp) as f:
            c = json.load(f)
        extra = dict(cpu_s=c["cpu_usuario_s"] + c["cpu_sistema_s"],
                     cpu_s_por_s_simulado=(c["cpu_usuario_s"] + c["cpu_sistema_s"]) / res["t_simulado_s"])
    sim = sim[1:] if len(sim) > 1 else sim
    if not sim:
        sim = [{"cpu_proceso_pct": "nan", "cpu_total_pct": "nan", "rss_proceso_mb": "nan", "mem_usada_sistema_mb": "nan"}]
    return dict(**extra, cpu_proceso=st.mean(float(r["cpu_proceso_pct"]) for r in sim),
                cpu_total=st.mean(float(r["cpu_total_pct"]) for r in sim),
                cpu_total_reposo=st.mean(float(r["cpu_total_pct"]) for r in rep),
                rss=st.mean(float(r["rss_proceso_mb"]) for r in sim),
                mem_sistema=st.mean(float(r["mem_usada_sistema_mb"]) for r in sim),
                mem_sistema_reposo=st.mean(float(r["mem_usada_sistema_mb"]) for r in rep),
                t_real=res["t_real_s"], factor=res["factor_tiempo_real"])


def ms(xs):
    return dict(media=st.mean(xs), desv=st.pstdev(xs) if len(xs) > 1 else 0.0, n=len(xs))


def main():
    salida = {"configuraciones": {}}
    for dconf in sorted(glob.glob(os.path.join(DATOS, "*/"))):
        nombre = os.path.basename(dconf.rstrip("/"))
        reps = sorted(glob.glob(os.path.join(dconf, "rep*")))
        if not reps:
            continue
        with open(os.path.join(reps[0], "resumen.json")) as f:
            esc = json.load(f).get("escenario", "completo")
        a = analizar_rep(reps[0]) if esc == "completo" else {"resumen_banco": json.load(open(os.path.join(reps[0], "resumen.json")))}
        hs = [host(r) for r in reps]
        huellas = [huella(r) for r in reps]
        claves = set.intersection(*[set(h) for h in hs])
        a["anfitrion"] = {k: ms([h[k] for h in hs]) for k in hs[0] if k in claves}
        a["repeticiones"] = len(reps)
        a["registros_identicos"] = len(set(huellas)) == 1
        a["huellas"] = huellas
        salida["configuraciones"][nombre] = a
        print(nombre, "reps", len(reps), "identicos", a["registros_identicos"])
    with open(os.path.join(DATOS, "resultados.json"), "w") as f:
        json.dump(salida, f, indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
