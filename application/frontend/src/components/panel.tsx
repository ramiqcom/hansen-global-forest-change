import { Store } from '@/modules/store';
import { useContext, useState } from 'react';
export default function Panel() {
  const { status } = useContext(Store);

  return (
    <div id='panel' className='flexible vertical gap'>
      <div className='title'>Hansen Global Forest Change</div>
      <Layers />
      <Legend />
      <div
        style={{
          textAlign: 'center',
          color:
            status.type == 'success' ? 'lightgreen' : status.type == 'failed' ? 'red' : 'lightblue',
        }}
      >
        {status.message}
      </div>
    </div>
  );
}

function Layers() {
  const { layer, setLayer, year, setYear, layers, minForestCover, setMinForestCover } =
    useContext(Store);
  const selectLayers = layers.map((dict, key) => (
    <button
      disabled={layer.value == dict.value}
      key={key}
      onClick={() => setLayer(dict)}
      className='button-select'
    >
      {dict.label}
    </button>
  ));
  const [tempYear, setTempYear] = useState(year);
  const yearDrag = (
    <div className='flexible vertical'>
      <input
        disabled={layer.value == 'lossyear'}
        type='range'
        min={2000}
        max={2024}
        value={year}
        onMouseUp={() => setYear(year)}
        onChange={(e) => setTempYear(Number(e.target.value))}
      />
      <div className='flexible wide'>
        <div>2000</div>
        <div
          className='flexible center2 center1 center3'
          style={{
            border: 'thin solid white',
            width: '10vh',
            height: '3vh',
            textAlign: 'center',
          }}
        >
          Year: {year}
        </div>
        <div>2024</div>
      </div>
    </div>
  );

  const [tempForestCover, setTempForestCover] = useState(minForestCover);
  const forestCoverDrag = (
    <div className='flexible wide center1'>
      Minimum tree density
      <div className='flexible vertical' style={{ width: '100%' }}>
        <input
          disabled={layer.value != 'forest_cover'}
          type='range'
          min={1}
          max={99}
          value={minForestCover}
          onMouseUp={() => setMinForestCover(minForestCover)}
          onChange={(e) => setTempForestCover(Number(e.target.value))}
        />
        <div className='flexible wide'>
          <div>1</div>
          <div>99</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className='flexible vertical small-gap'>
      Select layer to show to the map
      <div className='flexible wide'>{selectLayers}</div>
      {layer.value != 'lossyear' ? yearDrag : null}
      {layer.value == 'forest_cover' ? forestCoverDrag : null}
    </div>
  );
}

// Legend
function Legend() {
  const { layer } = useContext(Store);
  const { min, max, palette, label, value } = layer;

  let legend: JSX.Element;
  if (value != 'forest_cover') {
    legend = (
      <div className='flexible vertical'>
        <div
          style={{
            width: '100%',
            height: '2vh',
            backgroundImage: `linear-gradient(to right, ${palette.join(', ')})`,
            border: 'thin solid white',
          }}
        />
        <div className='flexible wide'>
          <div>{value == 'lossyear' ? min + 2000 : min}</div>
          <div>{value == 'lossyear' ? `${label} year` : label}</div>
          <div>{value == 'lossyear' ? max + 2000 : max}</div>
        </div>
      </div>
    );
  } else {
    legend = (
      <div className='flexible gap center1'>
        <div
          style={{
            width: '5vh',
            height: '2vh',
            backgroundColor: palette[0],
            border: 'thin solid white',
          }}
        />
        {label}
      </div>
    );
  }

  return legend;
}

// function UploadFile() {
//   const { setGeojson, setStatus, status } = useContext(Store);

//   return (
//     <div className='flexible vertical small-gap'>
//       1. Upload your region of interest in geojson format
//       <input
//         type='file'
//         accept='.geojson,.json'
//         disabled={status.type == 'process'}
//         onChange={async (e) => {
//           // Parse geojson from uploaded file
//           try {
//             setStatus({ message: 'Loading GeoJSON file...', type: 'process' });
//             const file = e.target.files[0];

//             const geojson: FeatureCollection<any, { [name: string]: any }> = JSON.parse(
//               await file.text(),
//             );

//             setGeojson(geojson);
//             setStatus({ message: 'GeoJSON loaded', type: 'success' });
//           } catch ({ message }) {
//             setStatus({ message, type: 'failed' });
//           }
//         }}
//       />
//     </div>
//   );
// }
