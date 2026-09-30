---
title: "MMIO Hands-On: A Bare-Metal UART"
date: 2026-09-30
category: "Hardware"
description: "A step-by-step tutorial: write a bare-metal program that prints text through a memory-mapped UART, and see what the CPU really does at the instruction level."
---

The best first MMIO project is a serial "Hello, world". It needs no operating system and
no libc. It runs in an emulator, so you don't need to buy hardware. And it teaches the
parts that matter: registers, status flags, polling and `volatile`.

We will write a small ARM64 program that boots on QEMU's `virt` machine and talks to its
UART using nothing but loads and stores. Sections marked **Under the hood** show what the
CPU does with those accesses.

### > What you need

- `qemu-system-aarch64`
- An AArch64 cross compiler (`aarch64-none-elf-gcc` or `aarch64-linux-gnu-gcc`)
- Four small files, all below

### > The memory map

Everything starts with the address map, the "datasheet" of the machine. On QEMU's `virt`
board, two entries matter to us:

| Address      | What lives there                    |
| ------------ | ----------------------------------- |
| `0x09000000` | UART0 (an ARM PL011 serial port)    |
| `0x40000000` | Start of RAM                        |

The UART exposes a handful of 32-bit registers. We need only three ideas from the PL011:

| Offset  | Register | What it does                                                                |
| ------- | -------- | --------------------------------------------------------------------------- |
| `0x000` | `DR`     | Data register. Write = send a byte. Read = receive a byte.                  |
| `0x018` | `FR`     | Flags. Bit 5 `TXFF`: transmit FIFO full. Bit 4 `RXFE`: receive FIFO empty. |

The actual address of a register is `base + offset`. So `DR` is at `0x09000000` and `FR`
is at `0x09000018`.

### > Step 1: boot code and linker script

There is no OS to set up a stack for us, so the first instructions must do it.
Save this as `start.S`:

```asm
.section .text.boot
.global _start

_start:
    ldr x0, =stack_top      // the stack has to exist before any C code runs
    mov sp, x0
    bl  main
1:  wfe                     // main() should never return; park the core
    b   1b
```

The linker script (`linker.ld`) places our code where RAM begins and reserves a stack
after it:

```ld
ENTRY(_start)

SECTIONS
{
    . = 0x40080000;             /* RAM on the QEMU "virt" machine starts at 0x40000000 */

    .text   : { *(.text.boot) *(.text*) }
    .rodata : { *(.rodata*) }
    .data   : { *(.data*) }
    .bss    : { *(.bss*) *(COMMON) }

    . = ALIGN(16);
    . += 0x4000;                /* 16 KiB of stack */
    stack_top = .;
}
```

Our program has no writable globals, so we can skip clearing `.bss`. A larger project
would need to do that in `_start`.

### > Step 2: the driver

Now the part this post is about. Save this as `main.c`:

```c
#include <stdint.h>

#define UART0_BASE  0x09000000UL

#define UART_DR     (*(volatile uint32_t *)(UART0_BASE + 0x000))
#define UART_FR     (*(volatile uint32_t *)(UART0_BASE + 0x018))

#define FR_RXFE     (1u << 4)   /* receive FIFO empty */
#define FR_TXFF     (1u << 5)   /* transmit FIFO full */

static void uart_putc(char c)
{
    while (UART_FR & FR_TXFF)
        ;
    UART_DR = c;
}

static void uart_puts(const char *s)
{
    while (*s) {
        if (*s == '\n')
            uart_putc('\r');
        uart_putc(*s++);
    }
}

static char uart_getc(void)
{
    while (UART_FR & FR_RXFE)
        ;
    return UART_DR & 0xFF;
}

void main(void)
{
    uart_puts("Hello from bare metal!\n");

    for (;;)
        uart_putc(uart_getc());
}
```

Read the macro on the `UART_DR` line from the inside out:

1. `UART0_BASE + 0x000` is a plain integer, the address.
2. `(volatile uint32_t *)` says "treat that integer as a pointer to a 32-bit value that
   can change on its own".
3. The leading `*` dereferences it, so `UART_DR` behaves like a variable that lives in
   the UART.

That is the whole trick. `UART_DR = c;` is a store to `0x09000000`. `UART_FR & FR_TXFF`
is a load from `0x09000018`.

Two design points to notice. First, `uart_putc` polls the `TXFF` flag before writing. A
device is slower than the CPU, and writing to a full FIFO would lose the byte. Second,
`uart_puts` sends `\r` before each `\n` because a serial terminal needs both a carriage
return and a line feed.

### > Step 3: build and run

```sh
CROSS=aarch64-linux-gnu-      # or aarch64-none-elf-
FLAGS="-O2 -ffreestanding -nostdlib -mgeneral-regs-only -fno-pic -fno-stack-protector"

${CROSS}gcc $FLAGS -c start.S -o start.o
${CROSS}gcc $FLAGS -c main.c  -o main.o
${CROSS}ld -T linker.ld start.o main.o -o kernel.elf

qemu-system-aarch64 -M virt -cpu cortex-a57 -nographic -kernel kernel.elf
```

The flags matter. `-ffreestanding -nostdlib` remove the C runtime we don't have.
`-mgeneral-regs-only` stops the compiler from using floating-point registers, which are
disabled at boot. Without it, some compilers emit an instruction that traps.

You should see `Hello from bare metal!`, and every key you type is echoed back. Press
`Ctrl-A` then `X` to quit QEMU.

### > Under the hood: what the CPU executes

Run `aarch64-linux-gnu-objdump -d kernel.elf` and look at the inner loop of
`uart_putc`, which the compiler inlined into `main`:

```text
40080040:  b9400020   ldr   w0, [x1]           // x1 = 0x09000018: read FR
40080044:  372fffe0   tbnz  w0, #5, 40080040   // bit 5 (TXFF) set? read again
40080048:  b9000083   str   w3, [x4]           // x4 = 0x09000000: write DR
```

There is nothing special here. `ldr` and `str` are the same instructions used to access
RAM. The CPU has no idea it is talking to a UART. What happens next is on the bus:

1. The CPU puts the address `0x09000018` on the system interconnect.
2. An address decoder compares it against the ranges in the memory map.
3. The address falls in the UART's range, not RAM's, so the request goes to the UART.
4. The UART returns the value of its flags register as the "memory" content.

The `str` works the same way in the other direction. The UART receives the byte, moves it
into its transmit FIFO, and starts shifting it out on the serial line. From the CPU's
point of view, the store simply finished.

This also explains why the MMU matters. Our program runs with the MMU off, so the CPU
treats data accesses as device memory: no caching, no reordering, no merging. With the
MMU on, you must mark this page as device memory yourself. Otherwise a cache could serve
the flags from a stale copy, and the loop above would spin forever.

### > Experiment: remove volatile

The best way to understand `volatile` is to delete it. Remove it from both macros,
recompile, and disassemble. The polling loop becomes:

```text
18:  b9400082   ldr   w2, [x4]          // read FR once, before the loop
1c:  38401401   ldrb  w1, [x0], #1
20:  36280042   tbz   w2, #5, 28        // TXFF clear? go send
24:  14000000   b     24                // TXFF set: jump to itself forever
```

The compiler reasoned that nothing in the program writes to `UART_FR`, so its value
cannot change, so reading it more than once is wasteful. It moved the read out of the
loop. If the FIFO is ever full, the program hangs forever on a stale value. The receive
loop in `uart_getc` is compiled the same way, so the program never waits for a key.

The code is valid C, and on RAM the optimization would be correct. The hardware, though,
changes the value without the program's knowledge, and `volatile` is how you tell the
compiler that.

### > Where to go next

- **Read the datasheet.** Look up the PL011 `UARTIBRD`, `UARTFBRD`, `UARTLCR_H` and
  `UARTCR` registers. QEMU works without setting them up, but real hardware needs the
  baud rate and the enable bit configured first.
- **Use bit fields carefully.** A common next step is a struct of registers with
  `volatile` members, one field per offset. It reads better, but check the generated
  assembly to make sure the compiler still does a single 32-bit access per operation.
- **Add an interrupt.** Instead of polling `RXFE`, unmask the UART interrupt in the
  GIC (the interrupt controller, which is also memory-mapped) and handle input from an
  exception handler.
- **Move to real hardware.** Blink an LED on a Raspberry Pi through its GPIO registers,
  or on an Arduino through `DDRB` and `PORTB`. The pattern is identical: find the base
  address, find the register offset, then load and store.

> "There is no special I/O instruction. There is only an address that doesn't lead to RAM."

Once you have written a driver like this, the same idea will be easy to spot in a Linux
driver, a hypervisor or a datasheet.
