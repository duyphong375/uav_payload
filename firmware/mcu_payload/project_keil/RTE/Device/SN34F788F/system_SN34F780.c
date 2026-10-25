/******************************************************************************
 * @file     system_SN34F780.c
 * @brief    CMSIS Cortex-M4 Device Peripheral Access Layer Source File
 *           for the SONIX SN32F780 Devices
 * @version  V1.0.0
 * @date     2023/10/3
 *
 * @note
 * Copyright (C) 2022-2024 ARM Limited. All rights reserved.
 *
 * @par
 * ARM Limited (ARM) is supplying this software for use with Cortex-M 
 * processor based microcontrollers.  This file can be freely distributed 
 * within development tools that are supporting such ARM based processors. 
 *
 * @par
 * THIS SOFTWARE IS PROVIDED "AS IS".  NO WARRANTIES, WHETHER EXPRESS, IMPLIED
 * OR STATUTORY, INCLUDING, BUT NOT LIMITED TO, IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE APPLY TO THIS SOFTWARE.
 * ARM SHALL NOT, IN ANY CIRCUMSTANCES, BE LIABLE FOR SPECIAL, INCIDENTAL, OR
 * CONSEQUENTIAL DAMAGES, FOR ANY REASON WHATSOEVER.
 *
 ******************************************************************************/


#include <stdint.h>
#include <SN34F780.h>

#if defined (USE_HAL_DRIVER)
 #include "sn34f78x_hal.h"
#endif /* USE_HAL_DRIVER */


/*
//-------- <<< Use Configuration Wizard in Context Menu >>> ------------------
*/

/*--------------------- Clock Configuration ----------------------------------
//
//<e0> Vector Table Offset Enable
//		<o1> Offset Base selection
//			<i> Flash Base 0x0000 0000
//			<i> SRAM Base 0x2000 0000
//					<0=> Flash
//					<1=> SRAM
//		<o2> Vector Table Offset in Flash base
//			<i> This value must be a multiple of 0x200
//			<0x0-0xFFFFFFFF:8>
//		<o3> Vector Table Offset in SRAM base
//			<i> This value must be a multiple of 0x200
//			<0x0-0xFFFFFFFF:8>
//	
//</e>
//	
//		<o4> EHS Source Frequency (MHz)
//      	<i> EHS frequency range = 10 ~ 25
//			<10-25>
*/

#define USER_VECTOR_TABLE 0
#define VECTOR_TABLE_SRAM 0
#define FLASH_OFFSET      0x00000000U
#define SRAM_OFFSET       0x00000000U
#define EHS_FREQ          16


/*
//-------- <<< end of configuration section >>> ------------------------------
*/


/* Note: Following vector table addresses must be defined in line with linker
         configuration. */
/*!< Enable USER_VECTOR_TABLE if you need to relocate the vector table
     anywhere in Flash or Sram, else the vector table is kept at the automatic
     remap of boot address selected */

#if (USER_VECTOR_TABLE == 1)
/*!< Uncomment the following line if you need to relocate your vector Table
     in Sram else user remap will be done in Flash. */
/* #define VECT_TAB_SRAM */
#if (VECTOR_TABLE_SRAM == 1)
  #define VECTOR_TABLE_BASE_ADDRESS   0x20000000UL    /*!< Vector Table base address field.
                                                     This value must be a multiple of 0x200. */
  #define VECTOR_TABLE_OFFSET         SRAM_OFFSET     /*!< Vector Table base offset field.
                                                     This value must be a multiple of 0x200. */
#else
  #define VECTOR_TABLE_BASE_ADDRESS   0x00000000UL    /*!< Vector Table base address field.
                                                     This value must be a multiple of 0x200. */
  #define VECTOR_TABLE_OFFSET         FLASH_OFFSET    /*!< Vector Table base offset field.
                                                     This value must be a multiple of 0x200. */
#endif /* VECTOR_TABLE_SRAM */
#endif /* USER_VECTOR_TABLE */


/**
 * Initialize the system
 *
 * @param  none
 * @return none
 *
 * @brief  Setup the microcontroller system.
 *         Initialize the FPU setting and vector table location.
 */
void SystemInit (void)
{
  /* FPU settings ------------------------------------------------------------*/
  #if (__FPU_PRESENT == 1) && (__FPU_USED == 1) 
				SCB->CPACR |= (0xF<<20); /* set CP10 and CP11 Full Access */
	#endif
  
  
  /* Configure the Vector Table location add offset address ------------------*/
  #if (USER_VECTOR_TABLE == 1)
    SCB->VTOR = VECTOR_TABLE_BASE_ADDRESS | VECTOR_TABLE_OFFSET; /* Vector Table Relocation in SRAM/Flash */
  #endif /* USER_VECT_TAB_ADDRESS */
}


/*----------------------------------------------------------------------------
  Define clocks
 *----------------------------------------------------------------------------*/
#define __ILRC_FREQ	    (32000UL)
#define __ELS_XTAL_FREQ (32768UL)

#if !defined  (__EHS_FREQ) 
  #define __EHS_FREQ    ((uint32_t)(EHS_FREQ * 1000000)) /*!< Default value of the External oscillator in Hz */
#endif /* __EHS_FREQ */

#if !defined  (__IHRC_FREQ)
  #define __IHRC_FREQ    ((uint32_t)12000000) /*!< Value of the Internal oscillator in Hz*/
#endif /* __IHRC_FREQ */


/*----------------------------------------------------------------------------
  Clock Variable definitions
 *----------------------------------------------------------------------------*/
uint32_t SystemCoreClock;	/*!< System Clock Frequency (Core Clock)*/


/*----------------------------------------------------------------------------
  Clock functions
 *----------------------------------------------------------------------------*/
void SystemCoreClockUpdate (void)            /* Get Core Clock Frequency      */
{
	uint32_t PLL_OUT_DIV, AHB_prescaler;
  uint32_t PLLNS;
  
  PLLNS = SN_SCU->PLLSTS_b.NSSTS;
  
	switch (SN_SCU->PLLSTS_b.SYSCLKSTS)
	{
		case 0:		//IHRC
			SystemCoreClock = __IHRC_FREQ;
		break;
		case 2:		//EHS X'TAL
			SystemCoreClock = __EHS_FREQ;
		break;
		case 4: 	//PLL
    {
			if (SN_SCU->PLLSTS_b.PLLCLKSTS == 0x0)
        SystemCoreClock = __IHRC_FREQ * PLLNS;  //IHRC as FREQ
      else
        SystemCoreClock = __EHS_FREQ * PLLNS;   //EHS as FREQ
      switch (SN_SCU->PLLSTS_b.FSSTS)
      {
        case 0: PLL_OUT_DIV = 32; break;
        case 1: PLL_OUT_DIV = 16; break;
        case 2:	PLL_OUT_DIV = 8;  break;
        case 3:	PLL_OUT_DIV = 4;  break;	
        default: break;
      }
      SystemCoreClock /= PLL_OUT_DIV;
    }
		break;
		default:
      SystemCoreClock = __IHRC_FREQ;
		break;
	}

	switch (SN_SCU->CLKPRE_b.AHBPRE)
	{
		case 0:	AHB_prescaler = 1;	break;
		case 1:	AHB_prescaler = 2;	break;
		case 2:	AHB_prescaler = 4;	break;
		case 3:	AHB_prescaler = 8;	break;
		case 4:	AHB_prescaler = 16;	break;
		case 5:	AHB_prescaler = 32;	break;
		case 6:	AHB_prescaler = 64;	break;
		case 7:	AHB_prescaler = 128;break;
		default: break;	
	}

	SystemCoreClock /= AHB_prescaler;
}




