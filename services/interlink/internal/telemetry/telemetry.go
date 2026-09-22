package telemetry

import (
	"context"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/exporters/prometheus"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

var (
	Tracer         trace.Tracer
	Meter          metric.Meter
	RequestCounter metric.Int64Counter
	RequestLatency metric.Float64Histogram
	ActiveStreams  metric.Int64UpDownCounter
)

func Init(serviceName, otelEndpoint string) (func(context.Context) error, error) {
	traceExporter, err := otlptracehttp.New(
		context.Background(),
		otlptracehttp.WithEndpoint(otelEndpoint),
		otlptracehttp.WithInsecure(),
	)
	if err != nil {
		return nil, err
	}

	res, err := resource.New(
		context.Background(),
		resource.WithAttributes(attribute.String("service.name", serviceName)),
	)
	if err != nil {
		return nil, err
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(traceExporter),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	promExporter, err := prometheus.New()
	if err != nil {
		return nil, err
	}
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(promExporter))
	otel.SetMeterProvider(mp)

	Tracer = otel.Tracer(serviceName)
	Meter = otel.Meter(serviceName)

	RequestCounter, _ = Meter.Int64Counter("interlink_requests_total",
		metric.WithDescription("Total RPC requests"),
	)
	RequestLatency, _ = Meter.Float64Histogram("interlink_request_duration_seconds",
		metric.WithDescription("Request latency in seconds"),
	)
	ActiveStreams, _ = Meter.Int64UpDownCounter("interlink_active_streams",
		metric.WithDescription("Active streaming RPCs"),
	)

	return func(ctx context.Context) error {
		if err := tp.Shutdown(ctx); err != nil {
			return err
		}
		return mp.Shutdown(ctx)
	}, nil
}

func RecordRequest(ctx context.Context, method string, duration float64, err error) {
	if RequestCounter == nil {
		return
	}
	attrs := []attribute.KeyValue{attribute.String("method", method)}
	if err != nil {
		attrs = append(attrs, attribute.String("error", err.Error()))
	}
	RequestCounter.Add(ctx, 1, metric.WithAttributes(attrs...))
	RequestLatency.Record(ctx, duration, metric.WithAttributes(attrs...))
}
