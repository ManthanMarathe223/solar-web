/**
 * charts-manager.js - Chart.js Visualizations Manager
 * IoT Sensor Monitoring & Servo Control System
 */

const ChartsManager = {
  charts: {},

  // Common dark theme options for Chart.js
  themeOptions: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false
    },
    plugins: {
      legend: {
        position: "top",
        align: "end",
        labels: {
          color: "#94a3b8",
          font: { family: "'Inter', sans-serif", size: 11 },
          boxWidth: 12,
          usePointStyle: true
        }
      },
      tooltip: {
        backgroundColor: "#101c36",
        titleColor: "#f8fafc",
        bodyColor: "#cbd5e1",
        borderColor: "rgba(0, 210, 255, 0.3)",
        borderWidth: 1,
        padding: 10,
        boxPadding: 4,
        usePointStyle: true,
        cornerRadius: 8,
        titleFont: { family: "'Inter', sans-serif", size: 12, weight: "bold" },
        bodyFont: { family: "'JetBrains Mono', monospace", size: 12 }
      }
    },
    scales: {
      x: {
        grid: { color: "rgba(148, 163, 184, 0.08)" },
        ticks: {
          color: "#64748b",
          font: { family: "'JetBrains Mono', monospace", size: 10 },
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 7
        }
      },
      y: {
        grid: { color: "rgba(148, 163, 184, 0.08)" },
        ticks: {
          color: "#94a3b8",
          font: { family: "'JetBrains Mono', monospace", size: 11 }
        }
      }
    }
  },

  /**
   * Initializes all analytics charts with historical data
   */
  initAnalyticsCharts(records = []) {
    if (typeof Chart === "undefined") {
      console.warn("Chart.js library is not loaded yet.");
      return;
    }

    const timestamps = records.map(r => SensorCalculations.formatTime(r.timestamp));
    const temps = records.map(r => r.temperatureC);
    const ldrRaws = records.map(r => r.ldrRaw);
    const lightPcts = records.map(r => r.lightPercentage);
    const s1Angles = records.map(r => r.servo1Angle);
    const s2Angles = records.map(r => r.servo2Angle);

    // 1. Temperature Chart
    this.createOrUpdate("chartTemp", "ctx-chart-temp", {
      type: "line",
      data: {
        labels: timestamps,
        datasets: [{
          label: "Temperature (°C)",
          data: temps,
          borderColor: "#ef4444",
          backgroundColor: "rgba(239, 68, 68, 0.12)",
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: records.length > 30 ? 1 : 3,
          pointHoverRadius: 5
        }]
      },
      options: {
        ...this.themeOptions,
        scales: {
          ...this.themeOptions.scales,
          y: {
            ...this.themeOptions.scales.y,
            title: { display: true, text: "°C", color: "#64748b", font: { size: 10 } }
          }
        }
      }
    });

    // 2. LDR Raw ADC Chart
    this.createOrUpdate("chartLdrRaw", "ctx-chart-ldr-raw", {
      type: "line",
      data: {
        labels: timestamps,
        datasets: [{
          label: "LDR Raw (ADC Count)",
          data: ldrRaws,
          borderColor: "#06b6d4",
          backgroundColor: "rgba(6, 182, 212, 0.1)",
          fill: true,
          tension: 0.25,
          borderWidth: 2,
          pointRadius: records.length > 30 ? 1 : 3
        }]
      },
      options: {
        ...this.themeOptions,
        scales: {
          ...this.themeOptions.scales,
          y: {
            ...this.themeOptions.scales.y,
            title: { display: true, text: "ADC Counts (0-4095)", color: "#64748b", font: { size: 10 } }
          }
        }
      }
    });

    // 3. Relative Light Percentage Chart
    this.createOrUpdate("chartLightPct", "ctx-chart-light-pct", {
      type: "line",
      data: {
        labels: timestamps,
        datasets: [{
          label: "Light Intensity (%)",
          data: lightPcts,
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245, 158, 11, 0.12)",
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: records.length > 30 ? 1 : 3
        }]
      },
      options: {
        ...this.themeOptions,
        scales: {
          ...this.themeOptions.scales,
          y: {
            ...this.themeOptions.scales.y,
            min: 0,
            max: 100,
            title: { display: true, text: "Relative %", color: "#64748b", font: { size: 10 } }
          }
        }
      }
    });

    // 4. Servo 1 Commanded Angle Chart
    this.createOrUpdate("chartServo1", "ctx-chart-servo1", {
      type: "line",
      data: {
        labels: timestamps,
        datasets: [{
          label: "Servo 1 Commanded Angle (°)",
          data: s1Angles,
          borderColor: "#8b5cf6",
          backgroundColor: "rgba(139, 92, 246, 0.1)",
          stepped: "middle",
          fill: true,
          borderWidth: 2,
          pointRadius: records.length > 30 ? 1 : 3
        }]
      },
      options: {
        ...this.themeOptions,
        scales: {
          ...this.themeOptions.scales,
          y: {
            ...this.themeOptions.scales.y,
            min: 0,
            max: 180,
            title: { display: true, text: "Degrees (°)", color: "#64748b", font: { size: 10 } }
          }
        }
      }
    });

    // 5. Servo 2 Commanded Angle Chart
    this.createOrUpdate("chartServo2", "ctx-chart-servo2", {
      type: "line",
      data: {
        labels: timestamps,
        datasets: [{
          label: "Servo 2 Commanded Angle (°)",
          data: s2Angles,
          borderColor: "#ec4899",
          backgroundColor: "rgba(236, 72, 153, 0.1)",
          stepped: "middle",
          fill: true,
          borderWidth: 2,
          pointRadius: records.length > 30 ? 1 : 3
        }]
      },
      options: {
        ...this.themeOptions,
        scales: {
          ...this.themeOptions.scales,
          y: {
            ...this.themeOptions.scales.y,
            min: 0,
            max: 180,
            title: { display: true, text: "Degrees (°)", color: "#64748b", font: { size: 10 } }
          }
        }
      }
    });

    // 6. Combined Correlation Chart (Dual Y-Axes: Light % vs Servo Angles)
    this.createOrUpdate("chartCombined", "ctx-chart-combined", {
      type: "line",
      data: {
        labels: timestamps,
        datasets: [
          {
            label: "Light Intensity (%) [Left]",
            data: lightPcts,
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.05)",
            yAxisID: "yLight",
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 2
          },
          {
            label: "Servo 1 Commanded (°) [Right]",
            data: s1Angles,
            borderColor: "#8b5cf6",
            yAxisID: "yServo",
            stepped: "middle",
            borderWidth: 2,
            borderDash: [4, 4],
            pointRadius: 2
          },
          {
            label: "Servo 2 Commanded (°) [Right]",
            data: s2Angles,
            borderColor: "#ec4899",
            yAxisID: "yServo",
            stepped: "middle",
            borderWidth: 2,
            borderDash: [2, 2],
            pointRadius: 2
          }
        ]
      },
      options: {
        ...this.themeOptions,
        scales: {
          x: this.themeOptions.scales.x,
          yLight: {
            type: "linear",
            position: "left",
            min: 0,
            max: 100,
            grid: { color: "rgba(148, 163, 184, 0.08)" },
            ticks: { color: "#f59e0b", font: { family: "'JetBrains Mono', monospace", size: 11 } },
            title: { display: true, text: "Light Intensity (%)", color: "#f59e0b", font: { size: 11, weight: "bold" } }
          },
          yServo: {
            type: "linear",
            position: "right",
            min: 0,
            max: 180,
            grid: { drawOnChartArea: false },
            ticks: { color: "#a78bfa", font: { family: "'JetBrains Mono', monospace", size: 11 } },
            title: { display: true, text: "Servo Commanded Angles (°)", color: "#a78bfa", font: { size: 11, weight: "bold" } }
          }
        }
      }
    });
  },

  /**
   * Initializes or updates the Servo History Timeline Chart
   */
  initServoHistoryChart(records = []) {
    if (typeof Chart === "undefined") return;

    const timestamps = records.map(r => SensorCalculations.formatTime(r.timestamp));
    const s1Angles = records.map(r => r.servo1Angle);
    const s2Angles = records.map(r => r.servo2Angle);

    this.createOrUpdate("chartServoTimeline", "ctx-chart-servo-history", {
      type: "line",
      data: {
        labels: timestamps,
        datasets: [
          {
            label: "Servo 1 Commanded (°)",
            data: s1Angles,
            borderColor: "#8b5cf6",
            backgroundColor: "rgba(139, 92, 246, 0.15)",
            stepped: "middle",
            fill: true,
            borderWidth: 2.5,
            pointRadius: 3
          },
          {
            label: "Servo 2 Commanded (°)",
            data: s2Angles,
            borderColor: "#ec4899",
            backgroundColor: "rgba(236, 72, 153, 0.1)",
            stepped: "middle",
            fill: true,
            borderWidth: 2.5,
            pointRadius: 3
          }
        ]
      },
      options: {
        ...this.themeOptions,
        scales: {
          ...this.themeOptions.scales,
          y: {
            ...this.themeOptions.scales.y,
            min: 0,
            max: 180,
            title: { display: true, text: "Angle (°)", color: "#64748b", font: { size: 10 } }
          }
        }
      }
    });
  },

  /**
   * Helper to create or smoothly update a Chart.js instance on an HTML canvas
   */
  createOrUpdate(chartKey, canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    if (this.charts[chartKey]) {
      // Re-use chart instance to avoid flickering
      const chart = this.charts[chartKey];
      chart.data.labels = config.data.labels;
      config.data.datasets.forEach((ds, idx) => {
        if (chart.data.datasets[idx]) {
          chart.data.datasets[idx].data = ds.data;
        } else {
          chart.data.datasets.push(ds);
        }
      });
      chart.update("none");
      return chart;
    }

    try {
      const ctx = canvas.getContext("2d");
      this.charts[chartKey] = new Chart(ctx, config);
      return this.charts[chartKey];
    } catch (err) {
      console.error(`Failed to create chart ${chartKey}:`, err);
      return null;
    }
  },

  /**
   * Appends a new realtime reading to existing charts smoothly
   */
  appendRealtimePoint(record) {
    if (!record) return;
    const timeLabel = SensorCalculations.formatTime(record.timestamp);

    const appendTo = (chartKey, values) => {
      const chart = this.charts[chartKey];
      if (!chart) return;

      chart.data.labels.push(timeLabel);
      if (chart.data.labels.length > 50) {
        chart.data.labels.shift();
      }

      values.forEach((val, idx) => {
        if (chart.data.datasets[idx]) {
          chart.data.datasets[idx].data.push(val);
          if (chart.data.datasets[idx].data.length > 50) {
            chart.data.datasets[idx].data.shift();
          }
        }
      });

      chart.update("none");
    };

    appendTo("chartTemp", [record.temperatureC]);
    appendTo("chartLdrRaw", [record.ldrRaw]);
    appendTo("chartLightPct", [record.lightPercentage]);
    appendTo("chartServo1", [record.servo1Angle]);
    appendTo("chartServo2", [record.servo2Angle]);
    appendTo("chartCombined", [record.lightPercentage, record.servo1Angle, record.servo2Angle]);
    appendTo("chartServoTimeline", [record.servo1Angle, record.servo2Angle]);
  }
};
