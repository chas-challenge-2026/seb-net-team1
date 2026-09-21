CC = gcc

CFLAGS = -O2 -fPIC -fvisibility=hidden
LDFLAGS = -shared

CFLAGS_CSV = -Ilibcsvparser/include -fopenmp
CFLAGS_IBAN = -Ilibiban/include

SRCS1 := $(wildcard libcsvparser/src/*.c)
SRCS2 := $(wildcard libiban/src/*.c)

.PHONY: all test test-csv test-iban libcsvparser.so libiban.so

all: test libcsvparser.so libiban.so

libcsvparser.so:
	$(CC) $(CFLAGS) $(CFLAGS_CSV) $(SRCS1) -o $@ $(LDFLAGS)

libiban.so:
	$(CC) $(CFLAGS) $(CFLAGS_IBAN) $(SRCS2) -o $@ $(LDFLAGS)

test: test-csv test-iban

test-csv:
	mkdir -p tests/binary
	$(CC) $(CFLAGS) $(CFLAGS_CSV) $(SRCS1) tests/test_libcsvparser.c -o tests/binary/test_libcsvparser
	./tests/binary/test_libcsvparser

test-iban:
	mkdir -p tests/binary
	$(CC) $(CFLAGS) $(CFLAGS_IBAN) -Dmain=iban_demo_main -c $(SRCS2) -o tests/binary/libiban.o
	$(CC) $(CFLAGS) $(CFLAGS_IBAN) tests/test_libiban.c tests/binary/libiban.o -o tests/binary/test_libiban
	./tests/binary/test_libiban