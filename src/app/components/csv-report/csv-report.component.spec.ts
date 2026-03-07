import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CsvReportComponent } from './csv-report.component';

describe('CsvReportComponent', () => {
  let component: CsvReportComponent;
  let fixture: ComponentFixture<CsvReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CsvReportComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CsvReportComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
