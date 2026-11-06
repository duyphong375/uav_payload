import React from 'react'
import { PageFrame } from '@/components/shared/PageFrame'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecentDetectionsTable } from '@/features/telemetry/RecentDetectionsTable'
import { TopStatCards } from '@/features/telemetry/TopStatCards'
import { UavHardwareGaugeCard } from '@/features/telemetry/UavHardwareGaugeCard'

export const OverviewPage: React.FC = () => {
  return (
    <PageFrame variant="scroll">
      <PageHeader
        title="Tổng quan"
        infoTip="Bảng điều khiển tác chiến SAR: mục tiêu cứu nạn, độ cao mặt nước, đường truyền LoRa và lịch sử nhận diện."
      />

      {/* Dải 3 chỉ số tác chiến */}
      <TopStatCards />

      {/* Nguồn/pin và các khối theo BOM KVC */}
      <UavHardwareGaugeCard />

      {/* Lịch sử nhận diện thời gian thực */}
      <RecentDetectionsTable />
    </PageFrame>
  )
}
