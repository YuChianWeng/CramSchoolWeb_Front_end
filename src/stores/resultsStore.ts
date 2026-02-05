let resultsCache: Record<string, any> | any[] | null = null

export const setResultsData = (data: Record<string, any> | any[]) => {
  resultsCache = data
}

export const getResultsData = () => resultsCache