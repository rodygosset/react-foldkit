export const repositoryUrl = "https://github.com/rodygosset/react-foldkit"

/** Links a directory in the repository on GitHub. */
export const treeUrl = (path: string): string => `${repositoryUrl}/tree/main/${path}`

/** Links a file in the repository on GitHub. */
export const blobUrl = (path: string): string => `${repositoryUrl}/blob/main/${path}`
