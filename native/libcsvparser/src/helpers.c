#include "helpers.h"

#ifdef _DEBUG
    #include <stdio.h>
    #include <stdarg.h>
    #include <stdint.h>
    #include <time.h>
    void dprintf(const char* fmt, ...)
    {
        va_list args;
        va_start(args, fmt);
        vprintf(fmt, args);
        va_end(args);
    }

    uint64_t altutime() {
        #if !defined(_WIN32) && !defined(__APPLE__)
        struct timespec time;
        clock_gettime(CLOCK_MONOTONIC, &time);
        return time.tv_sec * 1000000 + time.tv_nsec / 1000;
        #else
        struct timeval time;
        mingw_gettimeofday(&time, NULL);
        return time.tv_sec * 1000000 + time.tv_usec;
        #endif
    }
#endif