export function populateServers(servers) {
  const table = $("#table-servers tbody")

  for (const [serverID, serverData] of Object.entries(servers)) {
    table.append(`
      <tr>
        <td>${serverID}</td>
        <td>${serverData.emojis.join(' ')}</td>
        <td><a class="btn btn-primary btn-sm" href="${serverData.url} align="center" role="button" target="_blank">Join</a></td>
      </tr>
    `);
  }
}