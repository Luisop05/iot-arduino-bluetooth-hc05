#!/usr/bin/env python3
"""
Campana de mediciones de la Entrega 2.

Ejecuta el banco de pruebas (tb_hc05 / tb_hc05_corr) con cada configuracion y,
en paralelo, muestrea cada 0,5 s los mismos indicadores que muestran el
Administrador de tareas o top: CPU del proceso simulador, CPU total, memoria
residente del proceso y memoria usada del sistema. Toma 5 s de linea base antes
y despues de cada ejecucion.

Uso: python3 campana.py [--reps 5] [--solo NOMBRE]
Resultados: datos/<configuracion>/rep<k>/{host.csv, resumen.json, ...}
"""
import argparse, csv, json, os, resource, subprocess, time
import psutil

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TB = os.path.join(RAIZ, "testbench")
FW = os.path.join(RAIZ, "firmware")

CONFIGS = {
    # nombre: (banco, firmware, argumentos, repeticiones por defecto)
    "v2_sleep_tiempo_real": ("tb_hc05_corr", "build_bt_hc05_sleep_9600/bt_hc05.elf", [], None),
    "v2_sleep_avance_rapido": ("tb_hc05_corr", "build_bt_hc05_sleep_9600/bt_hc05.elf", ["--ff"], None),
    "v2_busy": ("tb_hc05_corr", "build_bt_hc05_busy_9600/bt_hc05.elf", [], None),
    "v1_bloqueante": ("tb_hc05_corr", "build_bt_hc05_v1_bloqueante_sleep_9600/bt_hc05_v1_bloqueante.elf", ["--ff"], 1),
    "v2_simavr_original": ("tb_hc05", "build_bt_hc05_sleep_9600/bt_hc05.elf", ["--ff"], 1),
    # Costo de simular el mismo firmware en reposo (20 s): LED apagados, LED encendidos
    # y LED apagados sin el sondeo de INT0/INT1 que hace simavr.
    "reposo_leds_apagados": ("tb_hc05_corr", "build_bt_hc05_sleep_9600/bt_hc05.elf", ["--ff", "--dur", "20", "--escenario", "reposo"], None),
    "reposo_leds_encendidos": ("tb_hc05_corr", "build_bt_hc05_sleep_9600/bt_hc05.elf", ["--ff", "--dur", "20", "--escenario", "reposo_leds"], None),
    "reposo_sin_sondeo": ("tb_hc05_corr", "build_bt_hc05_sleep_9600/bt_hc05.elf", ["--ff", "--dur", "20", "--escenario", "reposo", "--sin-sondeo"], None),
}


def ejecutar(nombre, rep, banco, fw, args, base=5.0, periodo=0.5):
    out = os.path.join(RAIZ, "datos", nombre, f"rep{rep}")
    os.makedirs(out, exist_ok=True)
    filas = []
    t0 = time.time()
    psutil.cpu_percent(None)

    def muestra(fase, proc=None):
        cpu_tot = psutil.cpu_percent(None)
        vm = psutil.virtual_memory()
        cpu_p = rss = ""
        if proc is not None:
            try:
                cpu_p = proc.cpu_percent(None)
                rss = proc.memory_info().rss / 2**20
            except psutil.Error:
                pass
        filas.append([round(time.time() - t0, 3), fase, cpu_p, cpu_tot, rss,
                      round((vm.total - vm.available) / 2**20, 1)])

    while time.time() - t0 < base:
        time.sleep(periodo); muestra("reposo_antes")
    cmd = [os.path.join(TB, banco), os.path.join(FW, fw), out] + args
    ru0 = resource.getrusage(resource.RUSAGE_CHILDREN)
    with open(os.path.join(out, "consola.txt"), "w") as log:
        p = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT)
        proc = psutil.Process(p.pid)
        proc.cpu_percent(None)
        while p.poll() is None:
            time.sleep(periodo); muestra("simulacion", proc)
    t1 = time.time()
    ru1 = resource.getrusage(resource.RUSAGE_CHILDREN)
    cpu_proc = {"cpu_usuario_s": ru1.ru_utime - ru0.ru_utime, "cpu_sistema_s": ru1.ru_stime - ru0.ru_stime,
                "rss_max_mb": ru1.ru_maxrss / 1024}
    with open(os.path.join(out, "cpu_proceso.json"), "w") as f:
        json.dump(cpu_proc, f, indent=1)
    while time.time() - t1 < base:
        time.sleep(periodo); muestra("reposo_despues")
    with open(os.path.join(out, "host.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["t_s", "fase", "cpu_proceso_pct", "cpu_total_pct", "rss_proceso_mb", "mem_usada_sistema_mb"])
        w.writerows(filas)
    with open(os.path.join(out, "resumen.json")) as f:
        r = json.load(f)
    print(f"{nombre} rep{rep}: {r['t_real_s']:.1f} s reales, x{r['factor_tiempo_real']:.2f}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reps", type=int, default=5)
    ap.add_argument("--solo", nargs="*")
    a = ap.parse_args()
    info = {"cpu": psutil.cpu_count(), "mem_mb": round(psutil.virtual_memory().total / 2**20),
            "fecha": time.strftime("%Y-%m-%d %H:%M:%S %z")}
    os.makedirs(os.path.join(RAIZ, "datos"), exist_ok=True)
    with open(os.path.join(RAIZ, "datos", "anfitrion.json"), "w") as f:
        json.dump(info, f, indent=1)
    for nombre, (banco, fw, args, reps) in CONFIGS.items():
        if a.solo and nombre not in a.solo:
            continue
        for k in range(1, (reps or a.reps) + 1):
            ejecutar(nombre, k, banco, fw, args)


if __name__ == "__main__":
    main()
