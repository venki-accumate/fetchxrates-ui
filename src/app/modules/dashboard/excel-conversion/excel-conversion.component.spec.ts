import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExcelConversionComponent } from './excel-conversion.component';

describe('ExcelConversionComponent', () => {
  let component: ExcelConversionComponent;
  let fixture: ComponentFixture<ExcelConversionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ExcelConversionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExcelConversionComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
