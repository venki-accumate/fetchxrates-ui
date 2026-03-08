import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { NgxSpinnerModule } from 'ngx-spinner';
import { CheckinComponent } from './checkin.component';
import { PricingComponent } from './pricing/pricing.component';
import { CheckinRoutingModule } from './checkin-routing.module';

@NgModule({
  declarations: [
    CheckinComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    PricingComponent,
    MatTabsModule,
    NgxSpinnerModule,
    CheckinRoutingModule
  ]
})
export class CheckinModule { }
