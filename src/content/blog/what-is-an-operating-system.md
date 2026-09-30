---
title: "What Is an Operating System?"
date: 2026-07-15
category: "Software"
description: "A first-chapter tour for CS students: the two classic definitions of an OS, the hardware support it needs, system calls, core abstractions and kernel structures."
---

Every operating systems course opens with the same question, and the standard textbooks
answer it in their first chapters. This post follows that path: Silberschatz's *Operating
System Concepts* (Introduction, Operating-System Structures), Tanenbaum's *Modern
Operating Systems* (Introduction), Stallings's *Operating Systems: Internals and Design
Principles* (Computer System Overview, Operating System Overview) and the *OSTEP*
book by Arpaci-Dusseau (Introduction to Operating Systems). Chapter titles vary slightly
between editions, but the ideas do not.

### > A first definition

Silberschatz gives the shortest version: an operating system is a program that manages
the computer hardware, provides a basis for application programs, and acts as an
intermediary between the user and the hardware.

No one definition fits every system. Tanenbaum's book explains why by describing two
views, and you should be able to argue for both.

- **The extended machine (top-down).** Raw hardware is hard to use. Talking to a disk
  means programming controller registers, as in the [MMIO posts](/blog/mmio-introduction).
  The OS hides that and offers clean abstractions such as files, processes and sockets.
  Programmers see a simpler, more portable machine.
- **The resource manager (bottom-up).** A computer has a CPU, memory, disks and network
  cards, and many programs want them at once. The OS decides who gets what, when, and
  keeps programs from interfering with each other.

Textbooks also point out the informal answer: the OS is the one program that is always
running, which is what we call the **kernel**. Everything else is either a system program
shipped with the OS or an application.

### > Where it sits

```text
+--------------------------------------------------+
|  Applications   (browser, editor, compiler)      |
+--------------------------------------------------+
|  System programs and libraries (shell, libc)     |
+==================================================+
|  Operating-system kernel                         |   <- privileged code
+==================================================+
|  Hardware (CPU, RAM, disks, network, devices)    |
+--------------------------------------------------+
```

The double line is the important boundary. Above it, code is untrusted and restricted.
Below it, code can do anything. Much of an OS course is about how that boundary is
enforced and how programs cross it safely.

### > Three big ideas

OSTEP organizes the whole subject around three themes, which give you a useful map for
the rest of the course.

1. **Virtualization.** The OS turns one physical resource into many virtual ones. One CPU
   becomes many, so every process seems to have its own CPU. Physical memory becomes a
   private *address space* per process.
2. **Concurrency.** Many things happen at once: processes, threads, interrupts. Sharing
   data between them safely leads to locks, semaphores and deadlock.
3. **Persistence.** RAM loses its contents at power-off. File systems and device drivers
   keep data safe on disks and SSDs.

### > Hardware support: why an OS is possible

An OS is not just software. It relies on features that Stallings and Silberschatz cover
in their opening chapters on computer organization.

- **Dual mode (user and kernel).** The CPU has at least two privilege levels. Certain
  instructions, such as changing page tables or talking to devices, only run in kernel
  mode. A user program that tries one causes a trap.
- **Interrupts.** Devices signal the CPU asynchronously: "the disk read is done", "a
  packet arrived". The CPU saves its state and jumps to a handler. Most of the time an OS
  is waiting for an interrupt.
- **The timer.** A hardware timer interrupts the CPU periodically. This lets the kernel
  regain control from a program that never yields, and it makes time-sharing possible.
- **Memory protection.** The MMU translates each program's addresses and enforces access
  rights, so one process cannot read or overwrite another's memory.
- **I/O mechanisms.** Programmed I/O and interrupts, and DMA for bulk transfers. From the
  CPU's side, devices are reached through registers, which is where
  [memory-mapped I/O](/blog/mmio-introduction) comes in.

### > System calls: the door into the kernel

A program in user mode cannot open a file or send a packet itself. It asks the kernel
through a **system call**. A system call is a controlled trap: a special instruction
switches the CPU to kernel mode and jumps to a fixed entry point. The kernel checks the
request, does the work, and returns to user mode.

Here is the smallest useful program:

```c
#include <unistd.h>

int main(void)
{
    write(1, "hello\n", 6);
    return 0;
}
```

On Linux you can watch the boundary being crossed with `strace`:

```text
$ strace ./hello
...
write(1, "hello\n", 6hello
)                  = 6
exit_group(0)                           = ?
+++ exited with 0 +++
```

The program made two system calls: `write` with file descriptor 1 (standard output), and
`exit_group` to end the process. The stray `hello` in the middle of the `write` line is
the program's own output, mixed with `strace`'s trace text because both go to the
terminal. Functions like `printf` are just library code, and they end in a call like
this one.

Textbooks group system calls into families: process control, file management, device
management, information maintenance, communication and protection. Application
programmers rarely use them directly. They call an API such as POSIX or the Windows API,
and the library makes the actual call.

### > The core abstractions

Every OS book spends its early chapters on the same short list of concepts.

- **Process.** A running program: its code, data, stack and the CPU state. A process is
  the OS's unit of resource ownership.
- **Thread.** A path of execution inside a process. Threads of one process share its
  address space.
- **Address space.** The memory a process believes it owns. With virtual memory, the
  addresses it uses are not physical ones.
- **File.** A named sequence of bytes. Unix takes this further with "everything is a
  file": devices, pipes and sockets use the same `open`, `read` and `write`.

### > Mechanism and policy

A design principle that appears in both Tanenbaum and Silberschatz is the separation of
**mechanism** from **policy**. A mechanism is *how* something is done, such as switching
from one process to another. A policy is *what* to decide, such as which process should
run next. Keeping them apart means you can change the scheduling algorithm without
rewriting the context switch. This is one reason OS design is hard: the mechanisms must
be flexible enough for policies you have not thought of yet.

### > How kernels are structured

Silberschatz's second chapter compares the main designs.

| Structure   | Idea                                                       | Example                       |
| ----------- | ---------------------------------------------------------- | ----------------------------- |
| Monolithic  | The whole OS runs in kernel mode as one large program      | Linux (with loadable modules) |
| Layered     | Levels, each using only the one below                      | THE system (a classic design) |
| Microkernel | Minimal kernel; other services run as user processes       | MINIX 3                       |
| Hybrid      | A mix: some services in the kernel for speed, but modular  | Windows NT, macOS (XNU)       |

A monolithic kernel is fast, because calls between components are ordinary function
calls, but a bug in any driver can crash everything. A microkernel isolates drivers and
servers in user space, so failures are contained, but messages between them cost time.
Real systems sit somewhere on this spectrum, and the debate between Tanenbaum and Linus
Torvalds in 1992 about it is worth reading.

### > How a machine boots

The OS has to get into memory first, and the CPU can only run code it can find. The
usual sequence is: firmware (BIOS or UEFI) initializes the hardware, the bootloader loads
the kernel, the kernel sets up memory management and drivers, and finally starts the
first user process (`init` or `systemd` on Linux). If you followed the
[UART tutorial](/blog/mmio-uart-tutorial), you have already written a tiny version of the
"kernel" step.

### > A short history

The chapters usually include one, and it explains why the features exist. Early machines
ran one job at a time. **Batch systems** queued jobs to keep the expensive hardware busy.
**Multiprogramming** kept several jobs in memory so the CPU could work while one waited
for I/O. **Time-sharing** added fast switching so many users could work interactively.
Personal computers, networks and mobile devices then brought new requirements: graphical
interfaces, power management, and security for machines that are always connected.

### > Try it yourself

- Run `strace -c` on a command like `ls` and see which system calls it uses most.
- Explore `/proc` on Linux: `cat /proc/self/status` shows the kernel's view of a process.
- Run `uname -a` and `lsmod`, then check whether your kernel is monolithic with modules.
- Write the `hello` program above without the C library, using the `syscall` instruction
  directly, and compare the result.

For deeper study, read chapters 1 and 2 of one of the books above, then continue with
the next topics they cover: processes, threads, CPU scheduling and synchronization.

> An OS is a resource allocator and a control program: it decides who gets the machine,
> and it stops anyone from misusing it.
