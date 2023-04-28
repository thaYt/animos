import { MAL } from '@server/helpers/mal';
import db from '@server/database';
import providers, { type AvailableProvider } from '@server/providers';
import type Provider from '@server/providers/generic';
import { AnimeSkip } from '@server/helpers/aniskip';
import type { EpisodeProvider, SkipTime } from '@prisma/client';

export class AnimeService {
	private malId: number;
	private currentProvider: AvailableProvider = 'animepahe';
	constructor(malId: number) {
		this.malId = malId;
	}

	static async getMostPopular() {
		const result = await MAL.getMostPopular();
		return result;
	}

	getPreferredProvider(): AvailableProvider {
		return this.currentProvider;
	}

	getProvider(): Provider {
		const provider = new providers[this.currentProvider](this.malId);
		return provider;
	}

	setProvider(provider: AvailableProvider) {
		this.currentProvider = provider;
	}

	async getEpisodes() {
		const provider = this.getProvider();

		const cachedEpisodes = await db.episodeProvider.findMany({
			where: {
				provider: provider.identifier,
				animeId: this.malId
			},
			orderBy: {
				episodeNumber: "asc"
			}
		});

		if (cachedEpisodes.length) {
			console.log('cache hit');
			return cachedEpisodes;
		}

		const episodes = await provider.getEpisodes();

		// return episodes;

		const providerEpisodes = await db.$transaction(
			episodes.map((ep) =>
				db.episodeProvider.create({
					data: {
						episodeNumber: ep.number,
						title: ep.title,
						episodeProviderId: ep.id,
						provider: provider.identifier,
						exactLength: ep.length,
						animeId: this.malId
					}
				})
			)
		);
		return providerEpisodes;
	}

	async getSource(episodeId: string): Promise<EpisodeProvider & { skipTimes?: SkipTime[] }> {
		const provider = this.getProvider();
		const episodeProvider = await db.episodeProvider.findUnique({
			where: {
				provider_animeId_episodeProviderId: {
					provider: provider.identifier,
					animeId: this.malId,
					episodeProviderId: episodeId
				}
			},
			include: {
				skipTimes: true
			},

		});
		if (!episodeProvider) throw new Error('No such episode'); // TODO add episodes again.
		if (episodeProvider.source && episodeProvider.skipTimes.length) {
			return episodeProvider;
		}

		let skipTimes: {
			type: "OPENING" | "ENDING";
			start: number;
			end: number;
		}[] | null;
		let info: {
			url: string,
			length: number
		}
		console.time("get all info");
		if (episodeProvider.exactLength != null) {
			const length = episodeProvider.exactLength;
			([skipTimes, info] = await Promise.all([
				AnimeSkip.getSkipTimes(this.malId, episodeProvider.episodeNumber, length),
				provider.getSourceInfo(episodeId, false)
			]));

		} else {
			info = await provider.getSourceInfo(episodeId);
			skipTimes = await AnimeSkip.getSkipTimes(this.malId, episodeProvider.episodeNumber, info.length)
		}
		console.timeEnd("get all info");
		const closestLength = info.length - (info.length % 100);
		const exactLength = info.length;
		const episode = await db.episode.upsert({
			create: {
				animeMalId: this.malId,
				length: closestLength,
				number: episodeProvider.episodeNumber
			},
			where: {
				animeMalId_number_length: {
					animeMalId: this.malId,
					length: closestLength,
					number: episodeProvider.episodeNumber
				}
			},
			update: {}
		});
		const result = await db.episodeProvider.update({
			where: {
				provider_animeId_episodeProviderId: {
					provider: provider.identifier,
					animeId: this.malId,
					episodeProviderId: episodeId
				}
			},
			data: {
				episodeId: episode.id,
				source: info.url,
				exactLength
			}
		});
		if (skipTimes) {
			const times = await db.$transaction(
				skipTimes.map((skip) =>
					db.skipTime.create({
						data: {
							type: skip.type,
							end: skip.end,
							start: skip.start,
							episodeProviderId: result.id
						}
					})
				)
			);
			return { ...result, skipTimes: times };
		} else return result;
	}
}
