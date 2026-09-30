---
title: "Memory-Mapped I/O"
date: 2026-09-29
category: "Hardware"
description: "MMIO lets the CPU talk to hardware with plain loads and stores. How it works on microcontrollers, consoles, PCs and phones, and why it shapes the tech we use."
---

Memory-mapped I/O (MMIO) is one idea: give hardware devices addresses in the same
address space as RAM. The CPU then talks to a device with the same `load` and `store`
instructions it uses for memory. No special commands are needed.

### > The core idea

A device such as a UART, a GPIO controller or a GPU exposes a few registers. The system
wires those registers to a range of physical addresses. Writing to an address in that
range sends the value to the device instead of storing it in RAM. Reading returns the
device's state.

```c
#define UART0_DR (*(volatile uint32_t *)0x09000000)

UART0_DR = 'A';   /* this store is a command: send 'A' over the serial line */
```

Two details set this apart from normal memory. Reads can have side effects: reading a
receive register may pop a byte from a FIFO. Writes may trigger actions instead of
storing data. That is why the `volatile` keyword matters. It stops the compiler from
caching, merging or removing accesses it thinks are redundant.

### > Microcontrollers

On an Arduino Uno (AVR), the pins are controlled by registers. `DDRB` sets each pin as
input or output, and `PORTB` sets its level. Both sit at fixed addresses (0x24 and 0x25).
The line `digitalWrite(13, HIGH)` ends up as this:

```c
DDRB  |= (1 << 5);   /* pin 13 (PB5) as output */
PORTB |= (1 << 5);   /* drive it high: the LED turns on */
```

Bigger ARM chips, like STM32 or the Raspberry Pi, work the same way, just with more
peripherals: timers, ADCs, SPI, I2C, DMA. On the original Raspberry Pi the GPIO block
starts at physical address 0x20200000. A program that maps that region and writes to it
controls the pins directly.

### > Game consoles

Retro consoles are a good place to see MMIO at its simplest. The NES CPU controls the
graphics chip through eight registers at `$2000–$2007`, and it reads the controllers at
`$4016`. The Game Boy puts its joypad at `$FF00` and its LCD control at `$FF40`. Emulator
authors spend much of their time implementing these registers one by one.

### > PCs, GPUs and phones

On x86, the old VGA text buffer at `0xB8000` was just memory: write a character byte and
an attribute byte, and it shows up on screen. Modern PCs use the same principle at a
larger scale. PCIe devices expose their registers through BARs (Base Address Registers).
A GPU exposes both control registers and a window into its VRAM. An NVMe SSD is driven by
writing "doorbell" registers to say that new commands are waiting in a queue.

Phone SoCs are the same in miniature. The camera ISP, the modem, the display controller
and the secure enclave all appear as ranges in one physical address map.

### > MMIO vs port-mapped I/O

x86 also has a second mechanism: separate `in` and `out` instructions with their own
16-bit port address space. Most other architectures, such as ARM and RISC-V, have no
such thing and use only MMIO. Even on x86, new devices use MMIO almost exclusively.
Port I/O survives mostly for legacy hardware.

### > How the OS handles it

Device memory is not normal memory. The kernel maps it as uncached (or with special
attributes) so that a write is not held in a cache and a read is not served from a stale
copy. Linux drivers call `ioremap()` and use `readl()` and `writel()` so the accesses
are ordered correctly. You can see the whole layout on your machine with
`cat /proc/iomem`. On ARM systems, the Device Tree tells the kernel where each peripheral
lives.

Ordering is a real trap. CPUs and buses reorder memory accesses for speed, and
"write the data, then ring the doorbell" can break if the two writes swap places. Memory
barriers exist for this reason.

### > Why it matters

- **Drivers are a unified problem.** Because everything is an address, one kernel
  mechanism covers every device. This is a big part of why operating systems can support
  thousands of different peripherals.
- **Virtualization depends on it.** A hypervisor can leave a guest's device addresses
  unmapped and trap each access, then emulate the device in software. This is how virtual
  hardware works. Formats like virtio-mmio and features like SR-IOV build on the same
  model.
- **Performance features follow.** Resizable BAR lets the CPU see all of a GPU's VRAM
  instead of a small window. That is an MMIO address-space change, and it shows up as
  frame rate gains.
- **Security is shaped by it.** A device that can read and write memory can attack the
  system. This is why IOMMUs exist, and why an untrusted Thunderbolt or USB4 device is
  not safe to plug in by default.
- **Hobbyists and tools benefit.** Vendors publish register maps in SVD files, and tools
  like svd2rust generate safe APIs from them. Reading a datasheet and poking a register
  is still the fastest way to understand a chip.

> "To the CPU, a device is just an address you can read from and write to."

The next time you press a key, launch a game or unlock a phone, think about the chain
behind it. Somewhere, a load or store instruction reached an address that was never RAM.
