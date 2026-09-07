CC = gcc

CFLAGS = -O2 -Ilibcsvparser/include -fopenmp -fPIC -fvisibility=hidden
LDFLAGS = -shared

SRCS1 := $(wildcard libcsvparser/src/*.c)

.PHONY: all test

all: test libcsvparser.so

libcsvparser.so:
	$(CC) $(CFLAGS) $(SRCS1) -o $@ $(LDFLAGS)

test:
	mkdir -p tests/binary
	$(CC) $(CFLAGS) $(SRCS1) tests/test_libcsvparser.c -o tests/binary/test_libcsvparser
	./tests/binary/test_libcsvparser