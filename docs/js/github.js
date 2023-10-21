export async function rawGithubJSONRequest(url) {
  const res = await rawGithubGetRequest(url);
  return await res.json();
}

async function rawGithubGetRequest(url) {
  const res = await fetch(url, {
    method: 'GET'
  });
  
  if (!res.ok) throw new Error(await res.text());

  return res;
}
