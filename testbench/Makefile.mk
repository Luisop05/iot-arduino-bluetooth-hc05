# tb_hc05       : enlazado con libsimavr 1.6 de la distribucion (apt install libsimavr-dev)
# tb_hc05_corr  : enlazado con simavr 1.6 compilado con simavr-uart-paridad.patch
SIMAVR_SRC ?= ../../simavr-src
all: tb_hc05 tb_hc05_corr
tb_hc05: tb_hc05.c
	gcc -O2 -Wall -o $@ $< -lsimavr -lelf -lm
tb_hc05_corr: tb_hc05.c
	gcc -O2 -Wall -o $@ $< $(SIMAVR_SRC)/simavr/obj-x86_64-linux-gnu/libsimavr.a -lelf -lm
clean:
	rm -f tb_hc05 tb_hc05_corr
