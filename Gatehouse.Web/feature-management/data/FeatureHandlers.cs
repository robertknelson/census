using Gatehouse.CommandQuery;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Gatehouse.FeatureManagement.Data;

// The fm tables have a connection of their own (FeatureAccess, gatehouse.md §8): locally a database of Gatehouse's,
// in the live app wherever its fm lives (often its default database, in which case point both names at it).
public class FeatureQueryHandler(IInitializerLocator locator, ILogger<JsonQueryHandler> logger, IConfiguration configuration)
    : JsonQueryHandler(locator, logger, configuration)
{
    public override string ConnectionKey => "fm";
}

public class FeatureCommandHandler(IInitializerLocator locator, ILogger<JsonCommandHandler> logger, IConfiguration configuration)
    : JsonCommandHandler(locator, logger, configuration)
{
    public override string ConnectionKey => "fm";
}
