CC = gcc

CFLAGS = -O2 -Ilibcsvparser/include -fopenmp -fPIC -fvisibility=hidden
LDFLAGS = -shared

SRCS1 := $(wildcard libcsvparser/src/*.c)

.PHONY: all libcsvparser.so

all: libcsvparser.so

libcsvparser.so:
	$(CC) $(CFLAGS) $(SRCS1) -o libcsvparser.so $(LDFLAGS)