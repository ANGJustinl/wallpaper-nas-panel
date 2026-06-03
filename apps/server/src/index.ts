import cors from 'cors';
import express from 'express';
import { createAppContext, seedApplicationData } from './bootstrap';
import { createDownloadedContentRoutes } from './routes/downloaded-content-routes';
import { createSettingsRoutes } from './routes/settings-routes';
import { createSteamLoginRoutes } from './routes/steam-login-routes';
import { createTaskRoutes } from './routes/task-routes';
import { createWorkshopRoutes } from './routes/workshop-routes';

const app = express();
const port = Number(process.env.PORT ?? 3001);
const context = createAppContext();
seedApplicationData(context);

const workshopRoutes = createWorkshopRoutes(context);
const taskRoutes = createTaskRoutes(context);
const downloadedContentRoutes = createDownloadedContentRoutes(context);
const settingsRoutes = createSettingsRoutes(context);
const steamLoginRoutes = createSteamLoginRoutes(context);

app.use(cors());
app.use(express.json());

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.get('/api/workshop/items', workshopRoutes.listWorkshopItems);
app.get('/api/tasks', taskRoutes.listTasks);
app.post('/api/tasks', taskRoutes.createTask);
app.delete('/api/tasks/history', taskRoutes.clearHistory);
app.delete('/api/tasks/:id', taskRoutes.deleteTask);
app.get('/api/tasks/:id/logs', taskRoutes.listTaskLogs);
app.get('/api/tasks/:id/logs/stream', taskRoutes.streamTaskLogs);
app.post('/api/tasks/:id/retry', taskRoutes.retryTask);
app.get('/api/library', downloadedContentRoutes.listContents);
app.get('/api/library/:id/preview', downloadedContentRoutes.getContentPreview);
app.get('/api/library/:id/files', downloadedContentRoutes.listContentFiles);
app.post('/api/library/:id/files/delete', downloadedContentRoutes.deleteContentFiles);
app.post('/api/library/:id/files/move', downloadedContentRoutes.moveContentFiles);
app.post('/api/library/rescan', downloadedContentRoutes.rescanContents);
app.post('/api/library/identify-steam', downloadedContentRoutes.identifySteamWorkshopContents);
app.delete('/api/library/:id', downloadedContentRoutes.deleteContent);
app.get('/api/settings', settingsRoutes.getSettings);
app.patch('/api/settings', settingsRoutes.updateSettings);
app.get('/api/steam/login-state', steamLoginRoutes.getLoginState);
app.get('/api/steam/login/logs', steamLoginRoutes.listLoginLogs);
app.get('/api/steam/login/logs/stream', steamLoginRoutes.streamLoginLogs);
app.post('/api/steam/login', steamLoginRoutes.triggerLogin);

app.listen(port, '0.0.0.0', () => {
  console.log(`server listening on http://0.0.0.0:${port}`);
});
