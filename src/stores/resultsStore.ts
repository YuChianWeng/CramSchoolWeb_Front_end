let resultsCache: any[] | null = null

export const setResultsData = (data: any[]) => {
  resultsCache = data
}

export const getResultsData = () => resultsCache