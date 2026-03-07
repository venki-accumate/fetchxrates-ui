import { NgModule } from '@angular/core';
import { CommonModule as AngularCommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { DashboardComponent } from './dashboard.component';
import { SharedComponentsModule } from '../common/common.module';
import { ExcelConversionComponent } from './excel-conversion/excel-conversion.component';
import { ExchangeRatesComponent } from './exchange-rates/exchange-rates.component';
import { CurrencyStatisticsComponent } from './currency-statistics/currency-statistics.component';
import { UserSchedulingComponent } from './user-scheduling/user-scheduling.component';

const routes: Routes = [
  {
    path: '',
    component: DashboardComponent
  },
  {
    path: 'conversion',
    component: ExcelConversionComponent
  },
  {
    path: 'rates',
    component: ExchangeRatesComponent
  },
  {
    path: 'statistics',
    component: CurrencyStatisticsComponent
  },
  {
    path: 'schedule',
    component: UserSchedulingComponent
  }
];

@NgModule({
  declarations: [
    DashboardComponent
  ],
  imports: [
    AngularCommonModule,
    RouterModule.forChild(routes),
    SharedComponentsModule,
    ExcelConversionComponent,
    ExchangeRatesComponent,
    CurrencyStatisticsComponent,
    UserSchedulingComponent
  ]
})
export class DashboardModule { }
