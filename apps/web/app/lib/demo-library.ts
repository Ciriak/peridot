export const albums = [
  {
    title: "Soft geometry",
    artist: "Óra",
    genre: "Ambient",
    color: "sand",
    duration: 246,
  },
  {
    title: "After the rain",
    artist: "North of June",
    genre: "Indie",
    color: "forest",
    duration: 218,
  },
  {
    title: "Blue hours",
    artist: "Elliot Lake",
    genre: "Jazz",
    color: "blue",
    duration: 284,
  },
  {
    title: "Sunroom",
    artist: "Milo Fields",
    genre: "Electronic",
    color: "orange",
    duration: 193,
  },
  {
    title: "In between",
    artist: "Still / Life",
    genre: "Ambient",
    color: "rose",
    duration: 327,
  },
];

export function findAlbums(query: string, favorites?: readonly number[]) {
  const normalized = query.trim().toLowerCase();
  return albums
    .map((album, index) => ({ ...album, index }))
    .filter(
      (album) =>
        `${album.title} ${album.artist} ${album.genre}`
          .toLowerCase()
          .includes(normalized) &&
        (favorites === undefined || favorites.includes(album.index)),
    );
}
export function toggleFavorite(
  favorites: readonly number[],
  index: number,
): number[] {
  return favorites.includes(index)
    ? favorites.filter((item) => item !== index)
    : [...favorites, index];
}
