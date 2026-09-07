#pragma once

#ifdef _DEBUG
    // Debug-only printing method [ENABLED]
    void dprintf(const char* fmt, ...);
#else
    // Debug-only printing method [DISABLED]
    #define dprintf(...) ((void)0)
#endif

#ifdef _WIN32
    #ifdef CSV_PARSER_EXPORTS
        #define CSV_API __declspec(dllexport)
    #else
        #define CSV_API __declspec(dllimport)
    #endif
#else
    #define CSV_API __attribute__((visibility("default")))
#endif

#ifdef _DEBUG
    #include <stdint.h>
    uint64_t altutime();
#endif