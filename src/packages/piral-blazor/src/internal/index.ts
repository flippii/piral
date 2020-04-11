import '@microsoft/dotnet-js-interop';
import { setPlatform } from './Environment';
import { monoPlatform } from './Platform/Mono/MonoPlatform';
import { renderBatch } from './Rendering/Renderer';
import { SharedMemoryRenderBatch } from './Rendering/RenderBatch/SharedMemoryRenderBatch';
import { Pointer } from './Platform/Platform';
import { attachRootComponentToElement } from './Rendering/Renderer';
import { setEventDispatcher } from './Rendering/RendererEventDispatcher';

// Keep in sync with BootJsonData in Microsoft.AspNetCore.Blazor.Build
interface BootJsonData {
  entryAssembly: string;
  assemblies: string[];
  linkerEnabled: boolean;
}

async function fetchBootConfigAsync() {
  // Later we might make the location of this configurable (e.g., as an attribute on the <script>
  // element that's importing this file), but currently there isn't a use case for that.
  const bootConfigResponse = await fetch('_framework/blazor.boot.json', { method: 'Get', credentials: 'include' });
  return bootConfigResponse.json() as Promise<BootJsonData>;
}

export async function boot() {
  setEventDispatcher((eventDescriptor, eventArgs) => DotNet.invokeMethodAsync('Microsoft.AspNetCore.Blazor', 'DispatchEvent', eventDescriptor, JSON.stringify(eventArgs)));

  // Configure environment for execution under Mono WebAssembly with shared-memory rendering
  const platform = setPlatform(monoPlatform);
  const _internal = {
    attachRootComponentToElement,
    renderBatch(browserRendererId: number, batchAddress: Pointer) {
      renderBatch(browserRendererId, new SharedMemoryRenderBatch(batchAddress));
    },
  };

  // Fetch the boot JSON file
  const bootConfig = await fetchBootConfigAsync();

  if (!bootConfig.linkerEnabled) {
    console.info('Blazor is running in dev mode without IL stripping. To make the bundle size significantly smaller, publish the application or see https://go.microsoft.com/fwlink/?linkid=870414');
  }

  // Determine the URLs of the assemblies we want to load, then begin fetching them all
  const loadAssemblyUrls = bootConfig.assemblies
    .map(filename => `_framework/_bin/${filename}`);

  try {
    await platform.start(loadAssemblyUrls);
  } catch (ex) {
    throw new Error(`Failed to start platform. Reason: ${ex}`);
  }

  // Start up the application
  platform.callEntryPoint(bootConfig.entryAssembly);

  return {
    platform,
    _internal,
  };
}
