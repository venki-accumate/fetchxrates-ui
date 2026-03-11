import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgxEchartsDirective } from 'ngx-echarts';

/**
 * ComparisonBarComponent — grouped bar chart for comparing currency rates across periods.
 *
 * Input format (dataSet):
 *   [{ Period: 'Jan 2024', EUR: 0.92, GBP: 0.79, JPY: 155.20 }, ...]
 *
 * The first key of each object is the category axis (Period).
 * All subsequent keys become individual bar series.
 */
@Component({
  selector: 'app-comparison-bar',
  standalone: true,
  imports: [NgxEchartsDirective, CommonModule],
  templateUrl: './comparison-bar.component.html',
  styleUrl: './comparison-bar.component.scss'
})
export class ComparisonBarComponent implements OnChanges {
  @Input() dataSet: any[] = [];
  @Input() fromCurrency = '';
  @Input() height = 420;

  options: any = null;

  private readonly COLORS = [
    '#22b71b', '#3b82f6', '#f59e0b', '#ef4444',
    '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16',
    '#fb923c', '#a78bfa'
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (this.dataSet?.length > 0) {
      this.buildOptions();
    }
  }

  private buildOptions(): void {
    const dimensions = Object.keys(this.dataSet[0]);
    const series = dimensions.slice(1).map(name => ({
      type: 'bar',
      name,
      barMaxWidth: 28
    }));

    this.options = {
      color: this.COLORS,
      title: {
        text: `${this.fromCurrency} Rates — Period Comparison`,
        left: 'center',
        textStyle: { fontSize: 14, fontWeight: '600' }
      },
      legend: { bottom: 32, type: 'scroll' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (v: any) => (+v).toFixed(4)
      },
      dataset: { source: this.dataSet },
      xAxis: {
        type: 'category',
        axisLabel: { rotate: 30, fontSize: 11 }
      },
      yAxis: {
        name: `1 ${this.fromCurrency} =`,
        nameTextStyle: { align: 'right' }
      },
      grid: { bottom: 90 },
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        {
          type: 'slider',
          bottom: 8,
          height: 24,
          start: 0,
          end: 100,
          borderColor: 'rgba(34,183,27,0.25)',
          fillerColor: 'rgba(34,183,27,0.12)',
          handleStyle: { color: '#22b71b', borderColor: '#22b71b' },
          moveHandleStyle: { color: '#22b71b' },
          dataBackground: {
            lineStyle: { color: 'rgba(34,183,27,0.4)', width: 1 },
            areaStyle: { color: 'rgba(34,183,27,0.06)' }
          },
          selectedDataBackground: {
            lineStyle: { color: 'rgba(34,183,27,0.8)', width: 1.5 },
            areaStyle: { color: 'rgba(34,183,27,0.15)' }
          },
          textStyle: { fontSize: 10, color: 'inherit' }
        }
      ],
      series
    };
  }
}
