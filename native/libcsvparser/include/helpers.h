#pragma once

#ifdef DEBUG
    // Debug-only printing method [ENABLED]
    void dprintf(const char* fmt, ...);
#else
    // Debug-only printing method [DISABLED]
    #define dprintf(...) ((void)0)
#endif