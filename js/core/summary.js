import { all } from './db.js';
import { getSettings } from './settings.js';
import {
  summaryMedia,
  summaryDev,
  summaryStudy,
  summaryFitness,
  summaryFood,
  summaryWish
} from './library.js';

export async function loadSummary(today) {
  const [media, projects, bugs, devTasks, devLogs, refs, events, workouts, meals, weights, wishes] =
    await Promise.all([
      all('media'),
      all('projects'),
      all('bugs'),
      all('devTasks'),
      all('devLogs'),
      all('refs'),
      all('events'),
      all('workouts'),
      all('meals'),
      all('weights'),
      all('wishes')
    ]);

  const settings = getSettings();

  return {
    media: summaryMedia(media, today),
    dev: summaryDev(projects, bugs, devTasks, devLogs, today),
    study: summaryStudy(refs, events, today),
    fitness: summaryFitness(workouts, today, settings.targets.weeklyWorkouts, settings.weekStart),
    food: summaryFood(meals, weights, settings.targets, today),
    play: summaryWish(wishes)
  };
}
