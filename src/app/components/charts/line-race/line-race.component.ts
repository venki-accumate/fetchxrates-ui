import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgxEchartsDirective } from 'ngx-echarts';

/**
 * LineRaceComponent — animated multi-line ECharts component.
 *
 * Input format:
 *   source: [['Currency','Period','Rate'], ['EUR','Jan 2024',0.92], ...]
 *   currencies: ['EUR','GBP','JPY', ...]
 *   fromCurrency: 'USD'  (used for title / y-axis label)
 */
@Component({
  selector: 'app-line-race',
  standalone: true,
  imports: [NgxEchartsDirective, CommonModule],
  templateUrl: './line-race.component.html',
  styleUrl: './line-race.component.scss'
})
export class LineRaceComponent implements OnChanges {
  @Input() source: any[][] = [];
  @Input() currencies: string[] = [];
  @Input() fromCurrency = '';
  @Input() height = 420;

  options: any = null;

  private readonly COLORS = [
    '#22b71b', '#3b82f6', '#f59e0b', '#ef4444',
    '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16',
    '#fb923c', '#a78bfa'
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (this.source?.length > 1 && this.currencies?.length) {
      this.buildOptions();
    }
  }

  private buildOptions(): void {
    const datasetWithFilters: any[] = [];
    const seriesList: any[] = [];

    this.currencies.forEach(currency => {
      const id = `ds_${currency}`;

      datasetWithFilters.push({
        id,
        fromDatasetId: 'ds_raw',
        transform: {
          type: 'filter',
          config: { dimension: 'Currency', '=': currency }
        }
      });

      seriesList.push({
        type: 'line',
        datasetId: id,
        name: currency,
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 2 },
        endLabel: {
          show: true,
          formatter: (p: any) => `${p.value[0]}: ${(+p.value[2]).toFixed(4)}`
        },
        labelLayout: { moveOverlap: 'shiftY' },
        emphasis: { focus: 'series' },
        encode: {
          x: 'Period',
          y: 'Rate',
          label: ['Currency', 'Rate'],
          itemName: 'Period',
          tooltip: ['Rate']
        }
      });
    });

    this.options = {
      color: this.COLORS,
      animationDuration: 3000,
      title: {
        text: `${this.fromCurrency} Exchange Rate Trends`,
        left: 'center',
        textStyle: { fontSize: 14, fontWeight: '600' }
      },
      tooltip: {
        order: 'valueDesc',
        trigger: 'axis',
        valueFormatter: (v: any) => (+v).toFixed(4)
      },
      legend: { bottom: 32, type: 'scroll' },
      xAxis: {
        type: 'category',
        nameLocation: 'middle',
        axisLabel: { rotate: 30, fontSize: 11 }
      },
      yAxis: {
        name: `1 ${this.fromCurrency} =`,
        nameTextStyle: { align: 'right' }
      },
      grid: { right: 150, bottom: 90 },
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
      dataset: [
        { id: 'ds_raw', source: this.source },
        ...datasetWithFilters
      ],
      series: seriesList
    };
  }
}
