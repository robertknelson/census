using Census.Web.Models.Api;
using Census.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace Census.Web.Controllers.Api;

/// <summary>
/// The fleet-wide change feed: latest vs previous snapshot for every machine that has
/// both, flattened into one "what changed since yesterday" stream.
/// </summary>
[ApiController]
[Route("api/changes")]
public class ChangesController(CensusStore censusStore) : ControllerBase
{
    [HttpGet]
    public ActionResult<ChangeFeedDto> GetChanges()
    {
        var machines = new List<MachineChangesDto>();

        foreach (var machine in censusStore.GetMachineDirs())
        {
            var refs = censusStore.GetSnapshotRefs(machine);
            if (refs.Count < 2) continue;

            var fromRef = refs[^2];
            var toRef = refs[^1];
            var fromEnvelope = censusStore.GetSnapshot(machine, fromRef.Date);
            var toEnvelope = censusStore.GetSnapshot(machine, toRef.Date);
            if (fromEnvelope is null || toEnvelope is null) continue;

            var diff = DiffEngine.Compute(machine, fromRef.Date.ToString("yyyy-MM-dd"), fromEnvelope, toRef.Date.ToString("yyyy-MM-dd"), toEnvelope);

            var entries = new List<ChangeEntryDto>();
            entries.AddRange(diff.ScalarChanges.Select(c => new ChangeEntryDto
            {
                Section = "os",
                Kind = "changed",
                Text = $"{c.Field}: {c.From} → {c.To}",
            }));
            foreach (var section in diff.Sections)
            {
                entries.AddRange(section.Added.Select(i => new ChangeEntryDto { Section = section.Name, Kind = "added", Text = i.Label }));
                entries.AddRange(section.Removed.Select(i => new ChangeEntryDto { Section = section.Name, Kind = "removed", Text = i.Label }));
                entries.AddRange(section.Changed.Select(i => new ChangeEntryDto
                {
                    Section = section.Name,
                    Kind = "changed",
                    Text = $"{i.Label}: {string.Join(", ", i.Changes.Select(c => $"{c.Field} {c.From} → {c.To}"))}",
                }));
            }

            if (entries.Count == 0) continue;

            machines.Add(new MachineChangesDto
            {
                Machine = machine,
                FromDate = fromRef.Date.ToString("yyyy-MM-dd"),
                ToDate = toRef.Date.ToString("yyyy-MM-dd"),
                Entries = entries,
            });
        }

        return Ok(new ChangeFeedDto { Machines = machines });
    }
}
