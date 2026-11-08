const params = new URLSearchParams('session=fixture');
const router = { push: (path: string) => { window.location.hash = path; }, replace: (path: string) => { window.location.hash = path; } };
export const useSearchParams = () => params;
export const useRouter = () => router;
