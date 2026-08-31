CC_WIN = x86_64-w64-mingw32-gcc
SHELL := cmd.exe

CFLAGS = -O2 -Iinclude -fopenmp -fPIC
CFLAGS_WIN = -shared
CFLAGS_DBG = -DDEBUG
LDFLAGS = 

OBJ_DIR := build_temp
SRC_DIR := src
DEF_FILE := resources/exports.def

OUT_DEBUG := csv_debugging.exe
OUT_WINDOWS := libcsvparser.dll

SRCS := $(wildcard src/*.c)
OBJS := $(patsubst %.c,$(OBJ_DIR)/%.o,$(SRCS))

.PHONY: all clean debug

all: debug

debug: CFLAGS += $(CFLAGS_DBG)
debug: $(OBJS)
	$(CC_WIN) $(CFLAGS) -o $(OUT_DEBUG) $^ $(LDFLAGS)
	./$(OUT_DEBUG)

windows: CFLAGS += $(CFLAGS_WIN)
windows: $(OBJS) $(DEF_FILE)
	$(CC_WIN) $(CFLAGS) -o $(OUT_WINDOWS) $^ $(LDFLAGS)

$(OBJ_DIR)/%.o: %.c
	@if not exist "$(dir $@)" mkdir "$(dir $@)"
	$(CC_WIN) $(CFLAGS) -c $< -o $@

clean:
	-del /Q "$(OUT_DEBUG)" 2>nul
	-del /Q "$(OUT_WINDOWS)" 2>nul
	-rmdir /S /Q "$(OBJ_DIR)" 2>nul