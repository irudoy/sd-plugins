CC = x86_64-w64-mingw32-gcc
CFLAGS = -O2

plugin/devices/razer-battery-helper.exe: plugin/devices/razer-battery-helper.c
	$(CC) $(CFLAGS) -o $@ $< -lsetupapi -lhid
