#pragma once

#include <string.h>

int tests_run = 0;
int tests_failed = 0;

#define COLOR_RED   "\033[31m"
#define COLOR_GREEN "\033[32m"
#define COLOR_RESET "\033[0m"

static char test_error[256];

#define TEST_ASSERT(condition, ...) \
    do { \
        if (!(condition)) { \
            snprintf(test_error, sizeof(test_error), __VA_ARGS__); \
            return 1; \
        } \
    } while (0)

#define RUN_TEST(test) \
    do { \
        tests_run++; \
        test_error[0] = '\0'; \
        if (test() != 0) { \
            tests_failed++; \
            printf(COLOR_RED " [FAIL]" COLOR_RESET " %s\n", #test); \
            if (test_error != NULL) \
                printf("         %s\n", test_error); \
        } else { \
            printf(COLOR_GREEN " [PASS]" COLOR_RESET " %s\n", #test); \
        } \
    } while (0)
