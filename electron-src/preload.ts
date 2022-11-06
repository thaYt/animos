const { contextBridge, ipcRenderer } = require('electron')

export const Endpoints = {
  hello: (name: string, age: number) => ipcRenderer.send('hello', name, age),
  searchAnime: (keyw: string) => ipcRenderer.send('search-anime', keyw),
  search: (name: string) => ipcRenderer.invoke('search-anime', name),
  popularAnime: () => ipcRenderer.invoke('get-popular-anime'),
  getEpisode: (animeId: number, episodeId: number) =>
    ipcRenderer.invoke('get-episode', animeId, episodeId),
  animeInfo: (animeId: number) => ipcRenderer.invoke('get-anime-info', animeId),
  getEpisodes: (animeId: number) => ipcRenderer.invoke('get-episodes', animeId),
  fullscreen: (makeFullscreen: boolean) =>
    ipcRenderer.send('fullscreen', makeFullscreen),
  setWatchTime: (animeMalId: number, episodeId: number, time: number) =>
    ipcRenderer.send('set-watchtime', animeMalId, episodeId, time),
  getWatchTime: (animeId:number, episodeId:number) => ipcRenderer.invoke("get-playtime", animeId, episodeId) as Promise<number>
}

export type EndpointType = typeof Endpoints;

contextBridge.exposeInMainWorld('api', Endpoints);
