import { NgModule } from '@angular/core';
import { CommonModule as AngularCommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { ApiComponent } from './api.component';
import { SharedComponentsModule } from '../common/common.module';

const routes: Routes = [
  {
    path: '',
    component: ApiComponent
  }
];

@NgModule({
  declarations: [ApiComponent],
  imports: [
    AngularCommonModule,
    RouterModule.forChild(routes),
    SharedComponentsModule
  ]
})
export class ApiModule { }
