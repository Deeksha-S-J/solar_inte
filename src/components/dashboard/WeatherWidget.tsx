import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Cloud, CloudRain, CloudSun, Sun, CloudLightning, Droplets, SunDim } from 'lucide-react';
import { WeatherData } from '@/types/solar';

interface WeatherWidgetProps {
  weather: WeatherData;
  openMeteoWeather?: WeatherData | null;
}

const weatherIcons = {
  sunny: Sun,
  cloudy: Cloud,
  'partly-cloudy': CloudSun,
  rainy: CloudRain,
  stormy: CloudLightning,
};

export function WeatherWidget({ weather, openMeteoWeather }: WeatherWidgetProps) {
  const DEGREE_C = '\u00B0C';
  const WeatherIcon = weatherIcons[weather.condition as keyof typeof weatherIcons] ?? CloudSun;
  const hasOnlineForecast = !!openMeteoWeather;
  const onlineWeather = openMeteoWeather ?? weather;
  const OpenMeteoIcon =
    weatherIcons[onlineWeather.condition as keyof typeof weatherIcons] ?? CloudSun;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Weather Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3 inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          On-site Sensor
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-accent/20 p-4">
              <WeatherIcon className="h-10 w-10 text-accent" />
            </div>
            <div>
              <div className="text-4xl font-bold">{weather.temperature.toFixed(2)}{DEGREE_C}</div>
              <div className="text-sm capitalize text-muted-foreground">
                {String(weather.condition).replace('-', ' ')}
              </div>
            </div>
          </div>
          <div className="space-y-2 text-right">
            <div className="flex items-center justify-end gap-2">
              <Droplets className="h-4 w-4 text-blue-500" />
              <span className="text-sm">{Math.round(weather.humidity)}%</span>
            </div>
            <div className="flex items-center justify-end gap-2">
              <SunDim className="h-4 w-4 text-yellow-500" />
              <span className="text-sm">{Math.round(weather.sunlightIntensity)}%</span>
            </div>
          </div>
        </div>
      </CardContent>
      <CardContent className="mt-3 border-t pt-4">
          <div className="mb-3 inline-flex items-center rounded-md border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-600 dark:text-sky-400">
            Online Forecast
          </div>
          {!hasOnlineForecast && (
            <div className="mb-2 text-xs text-muted-foreground">Live forecast unavailable, showing latest known conditions.</div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-accent/10 p-3">
                <OpenMeteoIcon className="h-8 w-8 text-accent" />
              </div>
              <div>
                <div className="text-2xl font-semibold">{Math.round(onlineWeather.temperature)}{DEGREE_C}</div>
                <div className="text-sm capitalize text-muted-foreground">
                  {String(onlineWeather.condition).replace('-', ' ')}
                </div>
              </div>
            </div>
            <div className="space-y-2 text-right">
              <div className="flex items-center justify-end gap-2">
                <Droplets className="h-4 w-4 text-blue-500" />
                <span className="text-sm">{Math.round(onlineWeather.humidity)}%</span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <SunDim className="h-4 w-4 text-yellow-500" />
                <span className="text-sm">{Math.round(onlineWeather.sunlightIntensity)}%</span>
              </div>
            </div>
          </div>
      </CardContent>
    </Card>
  );
}
