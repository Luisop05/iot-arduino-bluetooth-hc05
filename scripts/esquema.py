#!/usr/bin/env python3
"""Esquema del montaje de la Entrega 2 (schemdraw)."""
import os
import schemdraw
import schemdraw.elements as elm

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
schemdraw.config(fontsize=10, font="DejaVu Serif", lw=1.2)

with schemdraw.Drawing(file=os.path.join(RAIZ, "figuras", "fig_esquema.png"), dpi=300, show=False) as d:
    uno = elm.Ic(pins=[
        elm.IcPin(name="D0 (RX)", side="left", slot="2/6"),
        elm.IcPin(name="D1 (TX)", side="left", slot="1/6"),
        elm.IcPin(name="D5", side="left", slot="3/6"),
        elm.IcPin(name="5V", side="left", slot="5/6"),
        elm.IcPin(name="GND", side="left", slot="6/6"),
        elm.IcPin(name="D2", side="right", slot="4/4"),
        elm.IcPin(name="D3", side="right", slot="3/4"),
        elm.IcPin(name="D4", side="right", slot="2/4"),
        elm.IcPin(name="GND", side="right", slot="1/4", anchorname="GNDR"),
    ], size=(4.2, 6), pinspacing=1.0, edgepadW=0.5).anchor("center").at((0, 0))
    d += uno

    hc = elm.Ic(pins=[
        elm.IcPin(name="TXD", side="right", slot="2/6"),
        elm.IcPin(name="RXD", side="right", slot="1/6"),
        elm.IcPin(name="STATE", side="right", slot="3/6"),
        elm.IcPin(name="VCC", side="right", slot="5/6"),
        elm.IcPin(name="GND", side="right", slot="6/6"),
    ], size=(2.4, 6), pinspacing=1.0).anchor("center").at((-9.5, 0))
    d += hc
    d += elm.Label().at((0, 3.6)).label("Arduino UNO (ATmega328P)", fontsize=11)
    d += elm.Label().at((-9.5, 3.6)).label("HC-05 (Bluetooth SPP)", fontsize=11)

    # TXD -> D0
    d += elm.Line().at(hc.TXD).to(uno["D0 (RX)"])
    # D1 -> divisor -> RXD
    d += elm.Line().at(uno["D1 (TX)"]).left().length(2.2)
    d += (r1 := elm.Resistor().left().label("1 kΩ", loc="top"))
    d += elm.Dot()
    pt = r1.end
    d += elm.Line().at(pt).to((hc.RXD[0], pt[1]))
    d += elm.Resistor().at(pt).down().length(2.0).label("2 kΩ", loc="bottom", ofst=0.1)
    d += elm.Ground()
    # STATE -> D5
    d += elm.Line().at(hc.STATE).to(uno.D5)
    d += elm.Line().at(hc.VCC).to(uno["5V"])
    d += elm.Line().at(hc.GND).to(uno.GND)

    # LED verde en D2
    d += elm.Line().at(uno.D2).right().length(1.0)
    d += elm.Resistor().right().label("220 Ω", loc="top")
    d += elm.LED().right()
    d += elm.Line().right().length(2.4).label("LED verde", loc="top", fontsize=9)
    d += elm.Ground()
    # LED rojo en D3
    d += elm.Line().at(uno.D3).right().length(1.0)
    d += elm.Resistor().right().label("220 Ω", loc="top")
    d += elm.LED().right()
    d += elm.Line().right().length(2.4).label("LED rojo", loc="top", fontsize=9)
    d += elm.Ground()
    # Pulsador en D4 a GND (pull-up interno)
    d += elm.Line().at(uno.D4).right().length(1.0)
    d += elm.Button().right().label("pulsador", loc="bottom")
    d += elm.Line().right().length(5.4)
    d += elm.Ground()
    d += elm.Line().at(uno.GNDR).right().length(0.8)
    d += elm.Ground()
