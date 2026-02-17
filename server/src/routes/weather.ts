import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { fetchWeatherApi } from 'openmeteo';

const router = Router();

// Default location: Bangalore, India (postal code 560098)
const DEFAULT_LAT = 12.9719;
const DEFAULT_LON = 77.5937;
const SENSOR_WEATHER_MAX_AGE_MS = Number(process.env.SENSOR_WEATHER_MAX_AGE_MS ?? 10 * 60 * 1000);

// Map Open-Meteo weather codes to our app's conditions
const mapWeatherCode = (code: number): string => {
  // WMO Weather interpretation codes (WW)
  if (code === 0) return 'sunny';
  if (code === 1 || code === 2) return 'partly-cloudy';
  if (code === 3) return 'cloudy';
  if (code >= 45 && code <= 48) return 'foggy';
  if (code >= 51 && code <= 67) return 'rainy';
  if (code >= 71 && code <= 77) return 'snowy';
  if (code >= 80 && code <= 82) return 'rainy';
  if (code >= 85 && code <= 86) return 'snowy';
  if (code >= 95 && code <= 99) return 'thunderstorm';
  return 'sunny';
};

const fetchOpenMeteoData = async () => {
  try {
    // Using parameters from user's example for more accurate data
    const params = {
      latitude: DEFAULT_LAT,
      longitude: DEFAULT_LON,
      hourly: ['temperature_2m', 'relative_humidity_2m', 'weather_code', 'direct_radiation', 'diffuse_radiation', 'shortwave_radiation'],
      forecast_days: 1,
      timezone: 'auto',
    };
    
    const url = 'https://api.open-meteo.com/v1/forecast';
    console.log('Fetching weather from Open-Meteo with params:', JSON.stringify(params));
    
    const responses = await fetchWeatherApi(url, params);
    const response = responses[0];
    
    const hourly = response.hourly()!;
    const timeStart = Number(hourly.time());
    const timeEnd = Number(hourly.timeEnd());
    const interval = hourly.interval();
    
    // Get current hour index
    const now = Math.floor(Date.now() / 1000);
    const currentHourIndex = Math.max(0, Math.floor((now - timeStart) / interval));
    const numEntries = Math.floor((timeEnd - timeStart) / interval);
    const validIndex = Math.min(currentHourIndex, numEntries - 1);
    
    const temperature = hourly.variables(0)!.valuesArray()![validIndex];
    const humidity = hourly.variables(1)!.valuesArray()![validIndex];
    const weatherCode = hourly.variables(2)!.valuesArray()![validIndex];
    const directRadiation = hourly.variables(3)!.valuesArray()![validIndex] || 0;
    const diffuseRadiation = hourly.variables(4)!.valuesArray()![validIndex] || 0;
    const shortwaveRadiation = hourly.variables(5)!.valuesArray()![validIndex] || 0;
    
    // Calculate total radiation (W/m²)
    const totalRadiation = directRadiation + diffuseRadiation;
    
    // Calculate sunlight intensity based on radiation
    const hour = new Date().getHours();
    const isDaytime = hour >= 6 && hour <= 18;
    
    let sunlightIntensity: number;
    if (!isDaytime) {
      sunlightIntensity = 0;
    } else if (weatherCode === 0) {
      // Clear sky - high intensity based on radiation (max ~1000 W/m²)
      sunlightIntensity = Math.min(100, Math.round((totalRadiation / 10)));
    } else if (weatherCode <= 2) {
      // Partly cloudy - medium intensity
      sunlightIntensity = Math.min(90, Math.round((totalRadiation / 8)));
    } else {
      // Cloudy/rainy - lower intensity
      sunlightIntensity = Math.min(60, Math.round((totalRadiation / 6)));
    }
    
    console.log('Open-Meteo data fetched successfully:', {
      temperature,
      humidity,
      weatherCode,
      condition: mapWeatherCode(weatherCode),
      radiation: totalRadiation,
      sunlightIntensity,
      hour
    });
    
    // Get hourly data for forecast
    const hourlyForecast = response.hourly()!;
    const forecastTimeStart = Number(hourlyForecast.time());
    const forecastTimeEnd = Number(hourlyForecast.timeEnd());
    const forecastInterval = hourlyForecast.interval();
    const utcOffset = response.utcOffsetSeconds();
    const forecastNumEntries = Math.floor((forecastTimeEnd - forecastTimeStart) / forecastInterval);
    
    const hourlyTemp: number[] = [];
    const hourlyCode: number[] = [];
    const hourlyRadiation: number[] = [];
    
    for (let i = 0; i < forecastNumEntries; i++) {
      hourlyTemp.push(hourly.variables(0)!.valuesArray()![i] || 0);
      hourlyCode.push(hourly.variables(2)!.valuesArray()![i] || 0);
      const direct = hourly.variables(3)!.valuesArray()![i] || 0;
      const diffuse = hourly.variables(4)!.valuesArray()![i] || 0;
      hourlyRadiation.push(direct + diffuse);
    }
    
    const forecast = buildTimeBasedForecast(
      { temperature: hourlyTemp, weatherCode: hourlyCode, radiation: hourlyRadiation },
      forecastTimeStart,
      forecastInterval,
      utcOffset
    );
    
    return {
      temperature: Math.round(temperature * 10) / 10,
      condition: mapWeatherCode(weatherCode),
      humidity: Math.round(humidity),
      windSpeed: 0,
      cloudCover: 0,
      sunlightIntensity,
      weatherCode,
      description: getWeatherDescription(weatherCode),
      forecast,
    };
  } catch (error) {
    console.error('Error fetching Open-Meteo data:', error);
    return null;
  }
};

const getWeatherDescription = (code: number): string => {
  const descriptions: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
  };
  return descriptions[code] || 'Unknown';
};

const buildTimeBasedForecast = (hourlyData: { temperature: number[]; weatherCode: number[]; radiation: number[] }, timeStart: number, interval: number, utcOffsetSeconds: number) => {
  const forecasts = [];
  const today = new Date().toDateString();
  const now = Math.floor(Date.now() / 1000);
  const numEntries = hourlyData.temperature.length;
  
  for (let i = 0; i < numEntries; i++) {
    const timestamp = timeStart + (i * interval);
    const dateObj = new Date((timestamp + utcOffsetSeconds) * 1000);
    const hour = dateObj.getHours();
    const entryDate = dateObj.toDateString();
    
    // Show forecasts for today, all hours
    if (entryDate === today && hour >= 0 && hour <= 23) {
      const temp = hourlyData.temperature[i] || 0;
      const code = hourlyData.weatherCode[i] || 0;
      const radiation = hourlyData.radiation[i] || 0;
      const isDaytime = hour >= 6 && hour <= 18;
      
      forecasts.push({
        hour,
        temperature: Math.round(temp * 10) / 10,
        condition: mapWeatherCode(code),
        sunlightIntensity: isDaytime ? Math.min(100, Math.round((radiation / 1000) * 100)) : 0,
      });
    }
  }
  
  return forecasts;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// Get current weather
router.get('/current', async (_req: Request, res: Response) => {
  try {
    const latestSensorWeather = await prisma.weatherData.findFirst({
      orderBy: { recordedAt: 'desc' },
    });

    if (latestSensorWeather) {
      const ageMs = Date.now() - new Date(latestSensorWeather.recordedAt).getTime();
      if (ageMs <= SENSOR_WEATHER_MAX_AGE_MS) {
        res.json({
          ...latestSensorWeather,
          windSpeed: 0,
          cloudCover: 0,
          uvIndex: Math.max(1, Math.round((100 - latestSensorWeather.sunlightIntensity) / 10)),
          forecast: [],
          source: 'esp32',
        });
        return;
      }
    }

    // Try to fetch real weather data from Open-Meteo
    const meteoData = await fetchOpenMeteoData();
    
    if (meteoData) {
      res.json({
        temperature: meteoData.temperature,
        condition: meteoData.condition,
        humidity: meteoData.humidity,
        sunlightIntensity: meteoData.sunlightIntensity,
        recordedAt: new Date().toISOString(),
        windSpeed: meteoData.windSpeed,
        cloudCover: meteoData.cloudCover,
        uvIndex: Math.max(1, Math.round((100 - meteoData.sunlightIntensity) / 10)),
        forecast: meteoData.forecast || [],
        source: 'open-meteo',
        description: meteoData.description,
        weatherCode: meteoData.weatherCode,
      });
      return;
    }

    // Fallback to synthetic data if API fails - generate reasonable values directly
    const hour = new Date().getHours();
    const isDaytime = hour >= 6 && hour <= 18;
    
    // Generate reasonable temperature based on time of day (New York typical range)
    // Base temperature: 15°C, peaks around 2pm (+8°C), lowest around 6am (-3°C)
    const hourAngle = ((hour - 6) / 12) * Math.PI; // 0 at 6am, π at 6pm
    const baseTemp = 15 + Math.sin(hourAngle) * 8;
    const randomTemp = baseTemp + (Math.random() - 0.5) * 4;
    const nextTemp = Math.round(randomTemp * 10) / 10;
    
    const nextHumidity = clamp(Math.round(50 + (Math.random() - 0.5) * 20), 30, 80);
    const nextSun = isDaytime ? clamp(Math.round(70 + (Math.random() - 0.5) * 25), 30, 100) : 0;
    
    const conditions = nextSun > 70 ? ['sunny'] : nextSun > 40 ? ['partly-cloudy', 'sunny'] : ['cloudy', 'partly-cloudy'];
    const randomCondition = conditions[Math.floor(Math.random() * conditions.length)];

    // Generate synthetic hourly forecast for all hours
    const syntheticForecast = [];
    for (let h = 0; h <= 23; h++) {
      const hourAngle = ((h - 6) / 12) * Math.PI;
      const tempForHour = 15 + Math.sin(hourAngle) * 8;
      const isDaytime = h >= 6 && h <= 18;
      syntheticForecast.push({
        hour: h,
        temperature: Math.round(tempForHour * 10) / 10,
        condition: isDaytime ? (h < 13 ? 'sunny' : 'partly-cloudy') : 'clear',
        sunlightIntensity: isDaytime ? Math.min(95, 70 + h * 2) : 0,
      });
    }

    res.json({
      temperature: nextTemp,
      condition: randomCondition,
      humidity: nextHumidity,
      sunlightIntensity: nextSun,
      recordedAt: new Date().toISOString(),
      windSpeed: clamp(Math.round(8 + Math.random() * 12), 3, 25),
      uvIndex: isDaytime ? Math.max(1, Math.round(nextSun / 12)) : 0,
      forecast: syntheticForecast,
      source: 'synthetic',
    });
  } catch (error) {
    console.error('Error fetching current weather:', error);
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

// Get weather history
router.get('/history', async (req: Request, res: Response) => {
  try {
    const { days = 7 } = req.query;

    const startDate = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    const weatherHistory = await prisma.weatherData.findMany({
      where: {
        recordedAt: { gte: startDate },
      },
      orderBy: { recordedAt: 'desc' },
    });

    res.json(weatherHistory);
  } catch (error) {
    console.error('Error fetching weather history:', error);
    res.status(500).json({ error: 'Failed to fetch weather history' });
  }
});

// Record new weather data (for IoT sensors)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { temperature, condition, humidity, sunlightIntensity } = req.body;

    const weather = await prisma.weatherData.create({
      data: {
        temperature,
        condition,
        humidity,
        sunlightIntensity,
        recordedAt: new Date(),
      },
    });

    res.status(201).json(weather);
  } catch (error) {
    console.error('Error recording weather:', error);
    res.status(500).json({ error: 'Failed to record weather data' });
  }
});

// Get weather forecast
router.get('/forecast', async (_req: Request, res: Response) => {
  try {
    const params = {
      latitude: DEFAULT_LAT,
      longitude: DEFAULT_LON,
      hourly: ['temperature_2m', 'weather_code', 'direct_radiation'],
      forecast_days: 1,
      timezone: 'auto',
    };
    
    const url = 'https://api.open-meteo.com/v1/forecast';
    const responses = await fetchWeatherApi(url, params);
    const response = responses[0];
    
    const hourly = response.hourly()!;
    const timeStart = Number(hourly.time());
    const timeEnd = Number(hourly.timeEnd());
    const interval = hourly.interval();
    const tempData = hourly.variables(0)!.valuesArray()!;
    const codeData = hourly.variables(1)!.valuesArray()!;
    const radiationData = hourly.variables(2)!.valuesArray()!;
    
    const forecast = [];
    const today = new Date().toDateString();
    const numEntries = Math.floor((timeEnd - timeStart) / interval);
    
    for (let i = 0; i < Math.min(48, numEntries); i++) {
      const timestamp = timeStart + (i * interval);
      const dateObj = new Date(timestamp * 1000);
      const hour = dateObj.getHours();
      const entryDate = dateObj.toDateString();
      
      // Show forecasts for today, daytime hours only (6am-6pm)
      if (entryDate === today && hour >= 6 && hour <= 18) {
        forecast.push({
          hour,
          temperature: Math.round((tempData[i] || 0) * 10) / 10,
          condition: mapWeatherCode(codeData[i] || 0),
          sunlightIntensity: Math.min(100, Math.round(((radiationData[i] || 0) / 1000) * 100)),
        });
      }
    }
    
    res.json(forecast.slice(0, 4));
  } catch (error) {
    console.error('Error fetching forecast:', error);
    res.status(500).json({ error: 'Failed to fetch weather forecast' });
  }
});

// Get Open-Meteo current weather (for UI tile)
router.get('/open-meteo', async (_req: Request, res: Response) => {
  try {
    const meteoData = await fetchOpenMeteoData();
    if (!meteoData) {
      return res.status(503).json({ error: 'Open-Meteo unavailable' });
    }

    res.json({
      temperature: meteoData.temperature,
      condition: meteoData.condition,
      humidity: meteoData.humidity,
      sunlightIntensity: meteoData.sunlightIntensity,
      recordedAt: new Date().toISOString(),
      windSpeed: meteoData.windSpeed,
      cloudCover: meteoData.cloudCover,
      uvIndex: Math.max(1, Math.round((100 - meteoData.sunlightIntensity) / 10)),
      forecast: meteoData.forecast || [],
      source: 'open-meteo',
      description: meteoData.description,
      weatherCode: meteoData.weatherCode,
    });
  } catch (error) {
    console.error('Error fetching Open-Meteo weather:', error);
    res.status(500).json({ error: 'Failed to fetch Open-Meteo weather' });
  }
});

export default router;

