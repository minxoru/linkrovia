<script lang="ts">
  import type { Chart as ChartInstance, ScriptableContext } from 'chart.js';

  let {
    kind,
    labels,
    values,
    label,
  }: {
    kind: 'line' | 'bar';
    labels: string[];
    values: Array<number | null>;
    label: string;
  } = $props();
  let canvas: HTMLCanvasElement;

  $effect(() => {
    const chartLabels = labels;
    const chartValues = values;
    const chartLabel = label;
    const chartKind = kind;
    let chart: ChartInstance | undefined;
    let cancelled = false;
    const colors = () => {
      // Resolve light-dark() and nested custom properties through a real CSS property.
      const probe = document.createElement('span');
      document.body.appendChild(probe);
      const resolve = (name: string) => {
        probe.style.color = `var(${name})`;
        return getComputedStyle(probe).color;
      };
      const result = {
        series: resolve('--ui-series-1'),
        area: resolve('--ui-series-area'),
        text: resolve('--ui-text-muted'),
        border: resolve('--ui-border'),
      };
      probe.remove();
      return result;
    };
    const render = async () => {
      const { default: Chart } = await import('chart.js/auto');
      if (cancelled) return;
      chart?.destroy();
      const color = colors();
      const line = chartKind === 'line';
      chart = new Chart(canvas, {
        type: chartKind,
        data: {
          labels: chartLabels,
          datasets: [
            {
              label: chartLabel,
              data: chartValues,
              borderColor: color.series,
              backgroundColor: ({
                chart: graph,
              }: ScriptableContext<'line' | 'bar'>) => {
                if (!line) return color.series;
                const { chartArea, ctx } = graph;
                if (!chartArea) return color.area;
                const gradient = ctx.createLinearGradient(
                  0,
                  chartArea.top,
                  0,
                  chartArea.bottom,
                );
                gradient.addColorStop(0, color.area);
                gradient.addColorStop(1, 'transparent');
                return gradient;
              },
              borderWidth: 2,
              borderRadius: line ? 0 : 4,
              tension: 0.25,
              fill: line ? 'start' : false,
              pointRadius: 0,
              pointHoverRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          indexAxis: line ? 'x' : 'y',
          interaction: {
            mode: 'index',
            intersect: false,
            axis: line ? 'x' : 'y',
          },
          plugins: { legend: { display: false } },
          scales: {
            x: {
              ticks: {
                color: color.text,
                ...(line ? { maxRotation: 0, maxTicksLimit: 6 } : {}),
              },
              grid: { display: !line, color: color.border },
              ...(!line ? { beginAtZero: true } : {}),
            },
            y: {
              ticks: { color: color.text },
              grid: { display: line, color: color.border },
              ...(line ? { beginAtZero: true } : {}),
            },
          },
        },
      });
    };
    void render();
    const observer = new MutationObserver(() => {
      void render();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style', 'class'],
    });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onTheme = () => {
      void render();
    };
    media.addEventListener('change', onTheme);
    return () => {
      cancelled = true;
      observer.disconnect();
      media.removeEventListener('change', onTheme);
      chart?.destroy();
    };
  });
</script>

<div class="chart" class:breakdown={kind === 'bar'}>
  <canvas bind:this={canvas} aria-hidden="true"></canvas>
</div>

<style>
  .chart {
    position: relative;
    height: 16rem;
    min-width: 0;
    margin: 1rem 0;
  }
  .chart.breakdown {
    height: 18rem;
  }
  canvas {
    display: block;
    max-inline-size: 100%;
  }
</style>
