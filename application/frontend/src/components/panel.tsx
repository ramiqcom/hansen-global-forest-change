import { Store } from '@/modules/store';
import { FeatureCollection } from 'geojson';
import { useContext } from 'react';
export default function Panel() {
  const { status } = useContext(Store);

  return (
    <div id='panel' className='flexible vertical gap'>
      <div className='title'>Hansen Global Forest Change</div>
      <UploadFile />
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

function UploadFile() {
  const { setGeojson, setStatus, status } = useContext(Store);

  return (
    <div className='flexible vertical small-gap'>
      1. Upload your region of interest in geojson format
      <input
        type='file'
        accept='.geojson,.json'
        disabled={status.type == 'process'}
        onChange={async (e) => {
          // Parse geojson from uploaded file
          try {
            setStatus({ message: 'Loading GeoJSON file...', type: 'process' });
            const file = e.target.files[0];

            const geojson: FeatureCollection<any, { [name: string]: any }> = JSON.parse(
              await file.text(),
            );

            setGeojson(geojson);
            setStatus({ message: 'GeoJSON loaded', type: 'success' });
          } catch ({ message }) {
            setStatus({ message, type: 'failed' });
          }
        }}
      />
    </div>
  );
}
