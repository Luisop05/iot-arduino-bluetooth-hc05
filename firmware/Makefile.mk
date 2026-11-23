# Compila el sketch con el nucleo oficial ArduinoCore-avr, con las mismas
# opciones que usa el Arduino IDE para el UNO.
#   make                 -> build_bt_hc05_sleep_9600/bt_hc05.elf (USAR_SLEEP=1)
#   make VARIANTE=busy   -> build_bt_hc05_busy_9600/bt_hc05.elf (USAR_SLEEP=0)
#   make BAUD=38400      -> otra velocidad del enlace
#   make SKETCH=bt_hc05_v1_bloqueante -> version 1 (respuestas bloqueantes)
CORE   ?= ../../ArduinoCore-avr
BAUD   ?= 9600
VARIANTE ?= sleep
ifeq ($(VARIANTE),busy)
  SLEEP := 0
else
  SLEEP := 1
endif
SKETCH ?= bt_hc05
OUT    := build_$(SKETCH)_$(VARIANTE)_$(BAUD)

MCU    := atmega328p
DEFS   := -DF_CPU=16000000L -DARDUINO=10819 -DARDUINO_AVR_UNO -DARDUINO_ARCH_AVR \
          -DBT_BAUD=$(BAUD) -DUSAR_SLEEP=$(SLEEP)
INC    := -I$(CORE)/cores/arduino -I$(CORE)/variants/standard
CFLAGS := -mmcu=$(MCU) -Os -g -ffunction-sections -fdata-sections -flto $(DEFS) $(INC)
CXXFLAGS := $(CFLAGS) -std=gnu++11 -fpermissive -fno-exceptions -fno-threadsafe-statics
LDFLAGS := -mmcu=$(MCU) -Os -flto -fuse-linker-plugin -Wl,--gc-sections

CORE_C   := $(wildcard $(CORE)/cores/arduino/*.c)
CORE_CPP := $(wildcard $(CORE)/cores/arduino/*.cpp)
CORE_OBJ := $(patsubst $(CORE)/cores/arduino/%,$(OUT)/core/%.o,$(CORE_C) $(CORE_CPP))

all: $(OUT)/$(SKETCH).elf $(OUT)/$(SKETCH).hex

$(OUT)/core/%.c.o: $(CORE)/cores/arduino/%.c
	@mkdir -p $(dir $@)
	avr-gcc $(CFLAGS) -std=gnu11 -c $< -o $@

$(OUT)/core/%.cpp.o: $(CORE)/cores/arduino/%.cpp
	@mkdir -p $(dir $@)
	avr-g++ $(CXXFLAGS) -c $< -o $@

$(OUT)/sketch.cpp: $(SKETCH)/$(SKETCH).ino
	@mkdir -p $(OUT)
	( echo '#include <Arduino.h>'; echo '#line 1 "$(SKETCH).ino"'; cat $< ) > $@

$(OUT)/sketch.o: $(OUT)/sketch.cpp
	avr-g++ $(CXXFLAGS) -c $< -o $@

$(OUT)/$(SKETCH).elf: $(OUT)/sketch.o $(CORE_OBJ)
	avr-gcc $(LDFLAGS) $^ -o $@
	avr-size -C --mcu=$(MCU) $@

$(OUT)/$(SKETCH).hex: $(OUT)/$(SKETCH).elf
	avr-objcopy -O ihex -R .eeprom $< $@

clean:
	rm -rf build_*

.PHONY: all clean
