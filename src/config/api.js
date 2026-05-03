const DEFAULT_API_BASE_URL = 'https://kaylad-voip-backend-c4bufyetadgjb9ex.canadacentral-01.azurewebsites.net';
const envBaseUrl = String(process.env.REACT_APP_API_URL || '').trim();
const BASE_URL = (envBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '');

export default BASE_URL;
