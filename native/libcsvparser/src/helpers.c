#include "helpers.h"

#ifdef DEBUG
    #include <stdio.h>
    #include <stdarg.h>
    void dprintf(const char* fmt, ...)
    {
        va_list args;
        va_start(args, fmt);
        vprintf(fmt, args);
        va_end(args);
    }
#endif