;/******************************************************************************
; * @file     startup_SN34F780.s
; * @brief    CMSIS Cortex-M4 Core Device Startup File
; *           for the SONIX SN34F780 Device Series
; * @version  V2.0.2
; * @date     June 2024
; *------- <<< Use Configuration Wizard in Context Menu >>> ------------------
; *
; * @note
; * Copyright (C) 2022-2024 ARM Limited. All rights reserved.
; *
; * @par
; * ARM Limited (ARM) is supplying this software for use with Cortex-M 
; * processor based microcontrollers.  This file can be freely distributed 
; * within development tools that are supporting such ARM based processors. 
; *
; * @par
; * THIS SOFTWARE IS PROVIDED "AS IS".  NO WARRANTIES, WHETHER EXPRESS, IMPLIED
; * OR STATUTORY, INCLUDING, BUT NOT LIMITED TO, IMPLIED WARRANTIES OF
; * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE APPLY TO THIS SOFTWARE.
; * ARM SHALL NOT, IN ANY CIRCUMSTANCES, BE LIABLE FOR SPECIAL, INCIDENTAL, OR
; * CONSEQUENTIAL DAMAGES, FOR ANY REASON WHATSOEVER.
; *
; ******************************************************************************/


; <h> Stack Configuration
;   <o> Stack Size (in Bytes) <0x0-0xFFFFFFFF:8>
; </h>

Stack_Size		EQU		0x00000400

				AREA	STACK, NOINIT, READWRITE, ALIGN=3
Stack_Mem		SPACE	Stack_Size
__initial_sp


; <h> Heap Configuration
;   <o>  Heap Size (in Bytes) <0x0-0xFFFFFFFF:8>
; </h>

Heap_Size		EQU		0x00000200

				AREA	HEAP, NOINIT, READWRITE, ALIGN=3
__heap_base
Heap_Mem		SPACE	Heap_Size
__heap_limit

				PRESERVE8
				THUMB


; Vector Table Mapped to Address 0 at Reset
				AREA	RESET, DATA, READONLY
				EXPORT	__Vectors
				EXPORT  __Vectors_End
				EXPORT  __Vectors_Size


__Vectors				DCD	__initial_sp			; Top of Stack
						DCD	Reset_Handler			; Reset Handler
						DCD	NMI_Handler				; NMI Handler
						DCD     HardFault_Handler	; Hard Fault Handler
						DCD	MemManage_Handler		; MPU Fault Handler
						DCD	BusFault_Handler		; Bus Fault Handler
						DCD	UsageFault_Handler		; Usage Fault Handler
						DCD	0						; Reserved
						DCD	0						; Reserved
						DCD	0						; Reserved
						DCD	0						; Reserved
						DCD	SVC_Handler				; SVCall Handler
						DCD	DebugMon_Handler		; Debug Monitor Handler
						DCD	0						; Reserved
						DCD	PendSV_Handler			; PendSV Handler
						DCD	SysTick_Handler			; SysTick Handler

						; External Interrupts
						DCD	WWDT_IRQHandler			; IRQ 0: Window WatchDog Timer
						DCD	LVD_IRQHandler			; IRQ 1: LVD
						DCD	WDT_IRQHandler			; IRQ 2: WatchDog Timer
						DCD	SCU_IRQHandler			; IRQ 3: System Control Unit
						DCD	FLASH_IRQHandler		; IRQ 4: Flash Memory Control 
						DCD	0
						DCD	0
						DCD	0
						DCD	0
						DCD	0
						DCD	0
						DCD	DMA0_CH0_IRQHandler		; IRQ 11: DMA0 Channel 0
						DCD	DMA0_CH1_IRQHandler		; IRQ 12: DMA0 Channel 1
						DCD	DMA0_CH2_IRQHandler		; IRQ 13: DMA0 Channel 2
						DCD	DMA0_CH3_IRQHandler		; IRQ 14: DMA0 Channel 3
						DCD	DMA0_CH4_IRQHandler		; IRQ 15: DMA0 Channel 4
						DCD	DMA0_CH5_IRQHandler		; IRQ 16: DMA0 Channel 5
						DCD	DMA0_CH6_IRQHandler		; IRQ 17: DMA0 Channel 6
						DCD	ADC0_IRQHandler			; IRQ 18: ADC0
						DCD	CAN0_TX_IRQHandler		; IRQ 19: CAN0 TX
						DCD	CAN0_RX_IRQHandler		; IRQ 20: CAN0 RX
						DCD	CAN0_TT_IRQHandler		; IRQ 21: CAN0 Time Trigger
						DCD	CAN0_EW_IRQHandler		; IRQ 22: CAN0 Error and Warning
						DCD	0
						DCD	CT16B0_IRQHandler;		; IRQ 24: CT16B0
						DCD	CT16B8_IRQHandler;		; IRQ 25: CT16B8
						DCD	0
						DCD	CT16B3_IRQHandler;		; IRQ 27: CT16B3
						DCD	CT16B2_IRQHandler;		; IRQ 28: CT16B2
						DCD	CT16B5_IRQHandler;		; IRQ 29: CT16B5
						DCD	0
						DCD	I2C0_IRQHandler			; IRQ 31: I2C0
						DCD	0
						DCD	I2C1_IRQHandler			; IRQ 33: I2C2
						DCD	0
						DCD	SPI0_IRQHandler			; IRQ 35: SPI0
						DCD	SPI1_IRQHandler			; IRQ 36: SPI1
						DCD	UART0_IRQHandler		; IRQ 37: UART0
						DCD	UART1_IRQHandler		; IRQ 38: UART1
						DCD	UART2_IRQHandler		; IRQ 39: UART2
						DCD	0
						DCD	0
						DCD	0
						DCD	CT16B4_IRQHandler		; IRQ 43: CT16B4
						DCD	0
						DCD	CT16B1_IRQHandler		; IRQ 45: CT16B1
						DCD	0
						DCD	DMA0_CH7_IRQHandler		; IRQ 47: DMA0 Channel 7
						DCD	0
						DCD	SDIO_IRQHandler			; IRQ 49: SDIO
						DCD	0
						DCD	SPI2_IRQHandler			; IRQ 51: SPI2
						DCD	UART3_IRQHandler		; IRQ 52: UART3
						DCD	UART4_IRQHandler		; IRQ 53: UART4
						DCD	CT16B6_IRQHandler		; IRQ 54: CT16B6
						DCD	CT16B7_IRQHandler		; IRQ 55: CT16B7
						DCD	DMA1_CH0_IRQHandler		; IRQ 56: DMA1 Channel 0
						DCD	DMA1_CH1_IRQHandler		; IRQ 57: DMA1 Channel 1
						DCD	DMA1_CH2_IRQHandler		; IRQ 58: DMA1 Channel 2
						DCD	DMA1_CH3_IRQHandler		; IRQ 59: DMA1 Channel 3
						DCD	DMA1_CH4_IRQHandler		; IRQ 60: DMA1 Channel 4
						DCD	ETH_IRQHandler			; IRQ 61: Ethernet
						DCD	0
						DCD	CAN1_TX_IRQHandler		; IRQ 63: CAN1 TX
						DCD	CAN1_RX_IRQHandler		; IRQ 64: CAN1 RX
						DCD	CAN1_TT_IRQHandler		; IRQ 65: CAN1 Time Trigger
						DCD	CAN1_EW_IRQHandler		; IRQ 66: CAN1 Error and Warning
						DCD	0
						DCD	DMA1_CH5_IRQHandler		; IRQ 68: DMA1 Channel 5
						DCD	DMA1_CH6_IRQHandler		; IRQ 69: DMA1 Channel 6
						DCD	DMA1_CH7_IRQHandler		; IRQ 70: DMA1 Channel 7
						DCD	UART5_IRQHandler		; IRQ 71: UART5
						DCD	I2C2_IRQHandler			; IRQ 72: I2C2
						DCD	0
						DCD	0
						DCD	0
						DCD	0
						DCD	0
						DCD	0
						DCD	0
						DCD	0
						DCD	FPU_IRQHandler			; IRQ 81: FPU
						DCD	0
						DCD	0
						DCD	0
						DCD	0
						DCD	0
						DCD	0
						DCD	0
						DCD	0
						DCD	LCM_IRQHandler			; IRQ 90: LCM
						DCD	ETH_WOL_IRQHandler		; IRQ 91: Ethernet WOL
						DCD	GPIO3_IRQHandler		; IRQ 92: GPIO3
						DCD	GPIO2_IRQHandler		; IRQ 93: GPIO2
						DCD	GPIO1_IRQHandler		; IRQ 94: GPIO1
						DCD	GPIO0_IRQHandler		; IRQ 95: GPIO0
                                         
__Vectors_End

__Vectors_Size  EQU  __Vectors_End - __Vectors


	
				AREA    |.ARM.__at_0x0007DFFC|, CODE, READONLY	;AREA CODE;    Define,CODE,READONLY
;0x7DFFC
	DCD 0xAAAA5555;	
	; ISP_MODE_FLAG = 0xAAAA5555 for USER MODE
			
				AREA	|.text|, CODE, READONLY

; Reset Handler

Reset_Handler	PROC
				EXPORT  Reset_Handler			[WEAK]
				;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
				LDR	R0, =0x4001F004
				LDR	R1, [R0]
				AND R1, R1, #0xFFFEFFFF
				STR R1, [R0]
				LDR	R0, =0x4001F000
				LDR	R1, =0x00010000
				STR R1, [R0]
				;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
				IMPORT  SystemInit
				IMPORT  __main
				LDR     R0, =SystemInit
				BLX     R0
				LDR     R0, =__main
				BX      R0
				ENDP

; Dummy Exception Handlers (infinite loops which can be modified)

NMI_Handler     PROC
                EXPORT  NMI_Handler                [WEAK]
                B       .
                ENDP
HardFault_Handler\
                PROC
                EXPORT  HardFault_Handler          [WEAK]
                B       .
                ENDP
MemManage_Handler\
                PROC
                EXPORT  MemManage_Handler          [WEAK]
                B       .
                ENDP
BusFault_Handler\
                PROC
                EXPORT  BusFault_Handler           [WEAK]
                B       .
                ENDP
UsageFault_Handler\
                PROC
                EXPORT  UsageFault_Handler         [WEAK]
                B       .
                ENDP
SVC_Handler     PROC
                EXPORT  SVC_Handler                [WEAK]
                B       .
                ENDP
DebugMon_Handler\
                PROC
                EXPORT  DebugMon_Handler           [WEAK]
                B       .
                ENDP
PendSV_Handler  PROC
                EXPORT  PendSV_Handler             [WEAK]
                B       .
                ENDP
SysTick_Handler PROC
                EXPORT  SysTick_Handler            [WEAK]
                B       .
                ENDP

Default_Handler PROC

                EXPORT  WWDT_IRQHandler				[WEAK]
                EXPORT  LVD_IRQHandler				[WEAK]
                EXPORT  WDT_IRQHandler				[WEAK]
                EXPORT  SCU_IRQHandler				[WEAK]
                EXPORT  FLASH_IRQHandler				[WEAK]
                EXPORT  DMA0_CH0_IRQHandler			[WEAK]
                EXPORT  DMA0_CH1_IRQHandler			[WEAK]
                EXPORT  DMA0_CH2_IRQHandler			[WEAK]
                EXPORT  DMA0_CH3_IRQHandler			[WEAK]
                EXPORT  DMA0_CH4_IRQHandler			[WEAK]
                EXPORT  DMA0_CH5_IRQHandler			[WEAK]
                EXPORT  DMA0_CH6_IRQHandler			[WEAK]
                EXPORT  ADC0_IRQHandler				[WEAK]
                EXPORT  CAN0_TX_IRQHandler			[WEAK]
                EXPORT  CAN0_RX_IRQHandler			[WEAK]
                EXPORT  CAN0_TT_IRQHandler			[WEAK]
                EXPORT  CAN0_EW_IRQHandler			[WEAK]
                EXPORT  CT16B0_IRQHandler			[WEAK]
                EXPORT  CT16B8_IRQHandler			[WEAK]
                EXPORT  CT16B3_IRQHandler			[WEAK]
                EXPORT  CT16B2_IRQHandler			[WEAK]
                EXPORT  CT16B5_IRQHandler			[WEAK]
                EXPORT  I2C0_IRQHandler				[WEAK]
                EXPORT  I2C1_IRQHandler				[WEAK]
                EXPORT  SPI0_IRQHandler				[WEAK]
                EXPORT  SPI1_IRQHandler				[WEAK]
                EXPORT  UART0_IRQHandler			[WEAK]
                EXPORT  UART1_IRQHandler			[WEAK]
                EXPORT  UART2_IRQHandler			[WEAK]
                EXPORT  CT16B4_IRQHandler			[WEAK]
                EXPORT  CT16B1_IRQHandler			[WEAK]
                EXPORT  DMA0_CH7_IRQHandler			[WEAK]
                EXPORT  SDIO_IRQHandler				[WEAK]
                EXPORT  SPI2_IRQHandler				[WEAK]
                EXPORT  UART3_IRQHandler			[WEAK]
                EXPORT  UART4_IRQHandler			[WEAK]
                EXPORT  CT16B6_IRQHandler			[WEAK]
                EXPORT  CT16B7_IRQHandler			[WEAK]
                EXPORT  DMA1_CH0_IRQHandler			[WEAK]
                EXPORT  DMA1_CH1_IRQHandler			[WEAK]
                EXPORT  DMA1_CH2_IRQHandler			[WEAK]
                EXPORT  DMA1_CH3_IRQHandler			[WEAK]
                EXPORT  DMA1_CH4_IRQHandler			[WEAK]
                EXPORT  ETH_IRQHandler				[WEAK]
                EXPORT  CAN1_TX_IRQHandler			[WEAK]
                EXPORT  CAN1_RX_IRQHandler			[WEAK]
                EXPORT  CAN1_TT_IRQHandler			[WEAK]
                EXPORT  CAN1_EW_IRQHandler			[WEAK]
                EXPORT  DMA1_CH5_IRQHandler			[WEAK]
                EXPORT  DMA1_CH6_IRQHandler			[WEAK]
                EXPORT  DMA1_CH7_IRQHandler			[WEAK]
                EXPORT  UART5_IRQHandler			[WEAK]
                EXPORT  I2C2_IRQHandler				[WEAK]
                EXPORT  FPU_IRQHandler				[WEAK]
                EXPORT  LCM_IRQHandler				[WEAK]
                EXPORT  ETH_WOL_IRQHandler			[WEAK]
                EXPORT  GPIO3_IRQHandler			[WEAK]
                EXPORT  GPIO2_IRQHandler			[WEAK]
                EXPORT  GPIO1_IRQHandler			[WEAK]
                EXPORT  GPIO0_IRQHandler			[WEAK]


WWDT_IRQHandler
LVD_IRQHandler
WDT_IRQHandler
SCU_IRQHandler
FLASH_IRQHandler
DMA0_CH0_IRQHandler
DMA0_CH1_IRQHandler
DMA0_CH2_IRQHandler
DMA0_CH3_IRQHandler
DMA0_CH4_IRQHandler
DMA0_CH5_IRQHandler
DMA0_CH6_IRQHandler
ADC0_IRQHandler
CAN0_TX_IRQHandler
CAN0_RX_IRQHandler
CAN0_TT_IRQHandler
CAN0_EW_IRQHandler
CT16B0_IRQHandler
CT16B8_IRQHandler
CT16B3_IRQHandler
CT16B2_IRQHandler
CT16B5_IRQHandler
I2C0_IRQHandler
I2C1_IRQHandler
SPI0_IRQHandler
SPI1_IRQHandler
UART0_IRQHandler
UART1_IRQHandler
UART2_IRQHandler
CT16B4_IRQHandler
CT16B1_IRQHandler
DMA0_CH7_IRQHandler
SDIO_IRQHandler
SPI2_IRQHandler
UART3_IRQHandler
UART4_IRQHandler
CT16B6_IRQHandler
CT16B7_IRQHandler
DMA1_CH0_IRQHandler
DMA1_CH1_IRQHandler
DMA1_CH2_IRQHandler
DMA1_CH3_IRQHandler
DMA1_CH4_IRQHandler
ETH_IRQHandler
CAN1_TX_IRQHandler
CAN1_RX_IRQHandler
CAN1_TT_IRQHandler
CAN1_EW_IRQHandler
DMA1_CH5_IRQHandler
DMA1_CH6_IRQHandler
DMA1_CH7_IRQHandler
UART5_IRQHandler
I2C2_IRQHandler
FPU_IRQHandler
LCM_IRQHandler
ETH_WOL_IRQHandler
GPIO3_IRQHandler
GPIO2_IRQHandler
GPIO1_IRQHandler
GPIO0_IRQHandler
                B       .

                ENDP

                ALIGN


; User Stack and Heap

                 IF      :DEF:__MICROLIB
                
                EXPORT  __initial_sp
                EXPORT  __heap_base
                EXPORT  __heap_limit
                
                ELSE
                
                IMPORT  __use_two_region_memory
                EXPORT  __user_initial_stackheap

__user_initial_stackheap

                LDR     R0, =  Heap_Mem
                LDR     R1, =(Stack_Mem + Stack_Size)
                LDR     R2, = (Heap_Mem +  Heap_Size)
                LDR     R3, = Stack_Mem
                BX      LR

                ALIGN

                ENDIF


                END
